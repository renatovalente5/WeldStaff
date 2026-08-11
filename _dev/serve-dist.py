#!/usr/bin/env python3
"""Serve o build de produção (dist/weld-staff/browser) com fallback de SPA, para verificação local."""
import http.server, socketserver, os, sys, posixpath
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'weld-staff', 'browser')
os.chdir(os.path.abspath(RAIZ))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8140
class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        caminho = self.translate_path(self.path)
        if not os.path.exists(caminho) and not posixpath.splitext(self.path)[1]:
            self.path = '/index.html'
        return super().send_head()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0'); super().end_headers()
    def log_message(self, *a): pass
with socketserver.TCPServer(('', PORT), H) as s:
    print(f'WeldStaff (dist) em http://localhost:{PORT}'); s.serve_forever()
