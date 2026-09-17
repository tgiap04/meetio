import { isRenderableVietnameseText } from '../theme/typography';
import { ONBOARDING_PAGES } from './onboarding-pages';

describe('ONBOARDING_PAGES', () => {
  it('has exactly 3 pages, no more, no less', () => {
    expect(ONBOARDING_PAGES).toHaveLength(3);
  });

  it('has unique keys', () => {
    const keys = ONBOARDING_PAGES.map((page) => page.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has exactly one newline per title, for a two-line heading', () => {
    ONBOARDING_PAGES.forEach((page) => {
      expect(page.title.split('\n')).toHaveLength(2);
    });
  });

  it('renders on system fonts with full Vietnamese diacritic coverage', () => {
    ONBOARDING_PAGES.forEach((page) => {
      expect(isRenderableVietnameseText(page.title)).toBe(true);
      expect(isRenderableVietnameseText(page.body)).toBe(true);
    });
  });

  it('matches the design verbatim on page 1', () => {
    expect(ONBOARDING_PAGES[0].title).toBe('Ghi âm & Chuyển đổi\nthành văn bản');
  });

  it('mentions "Meetio" in pages 1 and 3, giving BrandedParagraph work to do', () => {
    expect(ONBOARDING_PAGES[0].body).toContain('Meetio');
    expect(ONBOARDING_PAGES[2].body).toContain('Meetio');
  });
});
