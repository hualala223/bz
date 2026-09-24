// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { imageMimeOfPath, imageExtOfMime, AI_IMAGE_MAX_BYTES } from '../../src/core/ai';

describe('AI 多模态基元（上游移植批 3f 前置）', () => {
  it('imageMimeOfPath：支持格式 → MIME，未知/无扩展 → null', () => {
    expect(imageMimeOfPath('a/b/c.PNG')).toBe('image/png');
    expect(imageMimeOfPath('/tmp/x.jpg')).toBe('image/jpeg');
    expect(imageMimeOfPath('x.svg')).toBeNull();
    expect(imageMimeOfPath('')).toBeNull();
  });

  it('imageExtOfMime：jpeg 归一 jpg；未知 → null', () => {
    expect(imageExtOfMime('image/jpeg')).toBe('jpg');
    expect(imageExtOfMime('image/webp')).toBe('webp');
    expect(imageExtOfMime('image/heic')).toBeNull();
  });

  it('AI_IMAGE_MAX_BYTES = 32MiB', () => {
    expect(AI_IMAGE_MAX_BYTES).toBe(32 * 1024 * 1024);
  });
});
