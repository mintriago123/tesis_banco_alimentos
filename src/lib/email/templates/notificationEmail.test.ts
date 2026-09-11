import { describe, expect, it } from 'vitest';
import { buildNotificationEmailTemplate } from './notificationEmail';

describe('buildNotificationEmailTemplate', () => {
  it('does not render action links for unsafe URLs', () => {
    const template = buildNotificationEmailTemplate({
      titulo: 'Notificacion',
      mensaje: 'Mensaje',
      categoria: 'sistema',
      urlAccion: 'javascript:alert(1)',
    });

    expect(template.html).not.toContain('<a ');
    expect(template.text).not.toContain('Ver detalle:');
  });

  it('escapes category in HTML and keeps plain text readable', () => {
    const template = buildNotificationEmailTemplate({
      titulo: 'Notificacion',
      mensaje: 'Mensaje',
      categoria: '<img src=x onerror=alert(1)>',
      urlAccion: '/admin/dashboard',
    });

    expect(template.html).toContain('Categoria: &lt;img src=x onerror=alert(1)&gt;');
    expect(template.html).toContain('href="/admin/dashboard"');
    expect(template.text).toContain('Categoria: <img src=x onerror=alert(1)>');
    expect(template.text).toContain('Ver detalle: /admin/dashboard');
  });
});
