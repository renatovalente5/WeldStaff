import { Component, EventEmitter, Input, Output, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { TurnstileComponent } from '../../../shared/turnstile/turnstile.component';

import { CareerService } from '../../../core/services/career';
import { environment } from '../../../../environments/environment';

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
    const validFiles = files.filter(file => {
      // Limit size to 5MB
      return file.size < 5 * 1024 * 1024;
    });

    if (this.selectedFiles.length + validFiles.length > this.maxFiles) {
      alert(this.translocoService.translate('careers.applicationModal.maxFilesError', { max: this.maxFiles }));
      return;
    }

    this.selectedFiles = [...this.selectedFiles, ...validFiles];
  }

  removeFile(index: number) {
    this.selectedFiles.splice(index, 1);
  }

  onSubmit() {
    if (!this.applicationForm.valid) {
      this.applicationForm.markAllAsTouched();
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
      },
      error: (error) => {
        console.error('Application error:', error);
        alert(this.translocoService.translate('careers.applicationModal.errorMessage'));
        this.isSubmitting = false;
        // Reset token so next attempt triggers a new challenge
        this.turnstileToken = '';
        this.turnstileWidget?.reset();
      }
    });
  }


  closeModal() {
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
