import { describe, it, expect } from 'vitest';
import { inboundMediaPayload, isMetaMediaId, mediaIdFromUrl } from './media';

describe('isMetaMediaId', () => {
  it('accepts numeric ids only', () => {
    expect(isMetaMediaId('2003382583705808')).toBe(true);
    expect(isMetaMediaId('abc')).toBe(false);
    expect(isMetaMediaId('123/../x')).toBe(false);
    expect(isMetaMediaId('')).toBe(false);
  });
});

describe('mediaIdFromUrl', () => {
  it('reads the id from mirrored and proxy urls', () => {
    expect(
      mediaIdFromUrl(
        'https://x/storage/v1/object/public/chat-media/account-1/inbound/2003382583705808-image-1791465622.jpg'
      )
    ).toBe('2003382583705808');
    expect(mediaIdFromUrl('/api/whatsapp/media/937813098936933')).toBe(
      '937813098936933'
    );
    expect(mediaIdFromUrl('https://x/chat-media/account-1/photo.jpg')).toBeNull();
    expect(mediaIdFromUrl(null)).toBeNull();
  });
});

describe('inboundMediaPayload', () => {
  it('maps the raw Meta media object', () => {
    expect(
      inboundMediaPayload({
        type: 'image',
        image: { id: '1', mime_type: 'image/jpeg', sha256: 'abc', caption: 'hi' },
      })
    ).toEqual({
      media_id: '1',
      mime_type: 'image/jpeg',
      caption: 'hi',
      filename: null,
      sha256: 'abc',
    });
  });

  it('is null for non-media messages', () => {
    expect(inboundMediaPayload({ type: 'text', text: { body: 'x' } })).toBeNull();
    expect(inboundMediaPayload({ type: 'image' })).toBeNull();
  });
});
