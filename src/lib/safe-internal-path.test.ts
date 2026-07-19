import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-internal-path';

describe('safeInternalPath', () => {
  it('allows internal application paths', () => {
    expect(safeInternalPath('/admin/dashboard')).toBe('/admin/dashboard');
    expect(safeInternalPath('/user/solicitudes')).toBe('/user/solicitudes');
    expect(safeInternalPath('/comprobante/ABC123')).toBe('/comprobante/ABC123');
  });

  it('rejects unsafe or external paths', () => {
    const unsafePaths = [
      '',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://evil.com',
      '//evil.com',
      '/\\evil',
      '/admin dashboard',
      '/admin/\nmalicious',
      '/admin?next=https://evil.com',
      '/administrator',
      '/publico',
    ];

    unsafePaths.forEach((path) => {
      expect(safeInternalPath(path)).toBeNull();
    });
  });

  it('rejects encoded path bypasses', () => {
    expect(safeInternalPath('/%5Cevil')).toBeNull();
    expect(safeInternalPath('/%2F%2Fevil.com')).toBeNull();
    expect(safeInternalPath('/admin/../publico')).toBeNull();
  });
});
