import { Component, EventEmitter, Input, Output, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { TurnstileComponent } from '../../../shared/turnstile/turnstile.component';

import { CareerService } from '../../../core/services/career';
import { environment } from '../../../../environments/environment';


// A mesma lista que o Worker aceita (worker/src/index.ts, TIPOS_ANEXO). O `accept` do
// input só vale para o seletor de ficheiros; quem arrasta pode trazer qualquer coisa, e o
// Worker recusava sem que o candidato soubesse porquê. A bateria do Worker compara as três.
const EXTENSOES_ACEITES = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'pages', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'];

function extensaoAceite(nome: string): boolean {
  const ponto = nome.lastIndexOf('.');
  return ponto > 0 && EXTENSOES_ACEITES.includes(nome.slice(ponto + 1).toLowerCase());
}

@Component({
  selector: 'app-job-application-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoModule, TurnstileComponent],
  templateUrl: './job-application-modal.html',
  styleUrls: ['./job-application-modal.scss']
})
export class JobApplicationModalComponent {
  @Input() jobTitle: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() submitApplication = new EventEmitter<{ form: any, files: File[] }>();

  applicationForm: FormGroup;
  selectedFiles: File[] = [];
  maxFiles = 3;
  isDragging = false;
  isSubmitting = false;

  siteKey = environment.turnstileSiteKey;
  turnstileToken = '';
  private pendingSubmit = false; // Waiting for Turnstile token after execute()

  @ViewChild(TurnstileComponent) turnstileWidget!: TurnstileComponent;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private dialogo?: HTMLDialogElement;

  // Um setter e não o ngAfterViewInit: o <dialog> vive dentro do *transloco, e só existe
  // quando as traduções chegam. Abre-se no instante em que aparece.
  @ViewChild('dialogo') set refDialogo(ref: ElementRef<HTMLDialogElement> | undefined) {
    this.dialogo = ref?.nativeElement;
    const d = this.dialogo;
    if (d && !d.open && typeof d.showModal === 'function') {
      queueMicrotask(() => { if (d.isConnected && !d.open) d.showModal(); });
    }
  }

  // Pela ordem em que aparecem no formulário: é o primeiro inválido que recebe o foco.
  private readonly camposPorOrdem: [string, string][] = [
    ['name', 'name'], ['phone', 'phone'], ['email', 'email'], ['consent', 'candidatura-consentimento'],
  ];

  constructor(
    private fb: FormBuilder,
    private careerService: CareerService,
    private cdr: ChangeDetectorRef,
    private translocoService: TranslocoService
  ) {
    this.applicationForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      message: [''],
      consent: [false, Validators.requiredTrue],
      website: [''] // Honeypot
    });
  }

  onTokenChange(token: string) {
    this.turnstileToken = token;
    this.cdr.detectChanges();

    // If submit was waiting for the token, proceed now
    if (this.pendingSubmit && token) {
      this.pendingSubmit = false;
      this.doSubmit();
    }
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files) {
      this.handleFiles(Array.from(files));
    }
    // Esvaziar, para que voltar a escolher o mesmo ficheiro (depois de o remover) dispare
    // outra vez o change.
    event.target.value = '';
  }

  /** A zona inteira abre o seletor; o clique que vem do próprio <input> já o abriu. */
  abrirSeletor(evento: Event) {
    const campo = this.fileInput?.nativeElement;
    if (campo && evento.target !== campo) campo.click();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    const files = event.dataTransfer?.files;
    if (files) {
      this.handleFiles(Array.from(files));
    }
  }

  handleFiles(files: File[]) {
    const recusados = files.filter(file => !extensaoAceite(file.name));
    if (recusados.length) {
      alert(this.translocoService.translate('careers.applicationModal.fileTypeError', {
        files: recusados.map(f => f.name).join(', ')
      }));
    }

    const validFiles = files.filter(file => {
      // Limit size to 5MB
      return extensaoAceite(file.name) && file.size < 5 * 1024 * 1024;
    });

    if (this.selectedFiles.length + validFiles.length > this.maxFiles) {
      alert(this.translocoService.translate('careers.applicationModal.maxFilesError', { max: this.maxFiles }));
      return;
    }

    this.selectedFiles = [...this.selectedFiles, ...validFiles];
  }

  removeFile(index: number) {
    this.selectedFiles.splice(index, 1);
    // O botão carregado desaparece com a linha; sem isto o foco caía no body.
    this.fileInput?.nativeElement.focus();
  }

  onSubmit() {
    if (this.isSubmitting) return; // aria-disabled não impede o clique: esta guarda sim

    if (!this.applicationForm.valid) {
      this.applicationForm.markAllAsTouched();
      // O botão continua focável com o formulário incompleto; ao carregar, o foco vai para
      // o primeiro campo em falta, que o leitor de ecrã anuncia como inválido.
      const primeiro = this.camposPorOrdem.find(([nome]) => this.applicationForm.get(nome)?.invalid);
      // Dentro do diálogo: «name» e «email» são ids genéricos, e um homónimo na página por
      // trás (inerte) engolia o foco.
      if (primeiro) this.dialogo?.querySelector<HTMLElement>(`#${primeiro[1]}`)?.focus();
      return;
    }

    this.isSubmitting = true;

    // If we already have a token (re-submit), go straight
    if (this.turnstileToken) {
      this.doSubmit();
    } else {
      // Trigger Turnstile challenge now — doSubmit called via onTokenChange
      this.pendingSubmit = true;
      this.turnstileWidget?.execute();
    }
  }

  private doSubmit() {
    const formData = new FormData();
    formData.append('name', this.applicationForm.get('name')?.value);
    formData.append('email', this.applicationForm.get('email')?.value);
    formData.append('phone', this.applicationForm.get('phone')?.value);
    formData.append('message', this.applicationForm.get('message')?.value || '');
    formData.append('website', this.applicationForm.get('website')?.value || '');
    formData.append('jobTitle', this.jobTitle);
    formData.append('turnstileToken', this.turnstileToken);

    this.selectedFiles.forEach((file) => {
      formData.append(`file`, file);
    });

    this.careerService.sendApplication(formData).subscribe({
      next: (response) => {
        console.log('Application success:', response);
        alert(this.translocoService.translate('careers.applicationModal.successMessage'));
        this.submitApplication.emit({
          form: this.applicationForm.value,
          files: this.selectedFiles
        });
        this.closeModal();
        this.isSubmitting = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Application error:', error);
        alert(this.translocoService.translate('careers.applicationModal.errorMessage'));
        this.isSubmitting = false;
        // Reset token so next attempt triggers a new challenge
        this.turnstileToken = '';
        this.turnstileWidget?.reset();
        // Sem isto o botão ficava preso em «A enviar...» por trás do alerta de
        // erro: sem zone.js, a resposta do subscribe não pede deteção nenhuma.
        this.cdr.markForCheck();
      }
    });
  }


  /**
   * Todos os caminhos de fecho passam aqui: o ×, o «Cancelar», o clique no véu, o fim do
   * envio. Fechar pelo próprio <dialog> devolve o foco a quem o abriu; o aviso chega ao pai
   * pelo evento close, que também é o que o Escape dispara.
   */
  closeModal() {
    const d = this.dialogo;
    if (d?.open) d.close();
    else this.close.emit();
  }

  aoFechar() {
    this.close.emit();
  }

  /**
   * Mobile fix: touchstart fires before the Turnstile challenge iframe
   * can absorb the event, so we close the modal immediately on touch.
   * preventDefault() stops the browser from also firing a click after.
   */
  onCloseTouch(event: TouchEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.closeModal();
  }

  onOverlayTouch(event: TouchEvent) {
    // Only close if the touch target is the overlay itself (not the modal container)
    if (event.target === event.currentTarget) {
      event.preventDefault();
      this.closeModal();
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 ' + this.translocoService.translate('common.fileSize.bytes');
    const k = 1024;
    const sizes = [
      this.translocoService.translate('common.fileSize.bytes'),
      this.translocoService.translate('common.fileSize.kb'),
      this.translocoService.translate('common.fileSize.mb'),
      this.translocoService.translate('common.fileSize.gb')
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
