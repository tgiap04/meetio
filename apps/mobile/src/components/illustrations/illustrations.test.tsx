import type { ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { Arc } from './arc';
import { Blob } from './blob';
import { AppMark } from './app-mark';
import { MicGlyph } from './mic-glyph';
import { OnboardingArt } from './onboarding-art';
import { MicPermissionArt } from './mic-permission-art';

const SIZES = [64, 128];

function renderSync(element: ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

describe('Arc', () => {
  it('renders without throwing at multiple sizes and spans', () => {
    SIZES.forEach((size) => {
      expect(() => renderSync(<Arc size={size} arcSpan="half" color="#F68001" rotation={45} />)).not.toThrow();
    });
  });

  it('colors only the sides selected by arcSpan', () => {
    const renderer = renderSync(<Arc size={64} arcSpan="quarter" color="#F68001" testID="arc" />);
    const json = renderer.toJSON();
    const style = Array.isArray(json) ? json[0]?.props.style : json?.props.style;
    expect(style.borderTopColor).toBe('#F68001');
    expect(style.borderRightColor).toBe('transparent');
    expect(style.borderBottomColor).toBe('transparent');
    expect(style.borderLeftColor).toBe('transparent');
  });
});

describe('Blob', () => {
  it.each(['topRight', 'bottomLeft'] as const)('renders the %s variant at multiple sizes without throwing', (variant) => {
    SIZES.forEach((size) => {
      expect(() => renderSync(<Blob size={size} variant={variant} />)).not.toThrow();
    });
  });
});

describe('AppMark', () => {
  it('renders exactly 5 waveform bars', () => {
    SIZES.forEach((size) => {
      const renderer = renderSync(<AppMark size={size} testID="app-mark" />);
      const bars = [0, 1, 2, 3, 4].map((index) => renderer.root.findByProps({ testID: `app-mark-bar-${index}` }));
      expect(bars).toHaveLength(5);
    });
  });
});

describe('MicGlyph', () => {
  it('renders without throwing at multiple sizes', () => {
    SIZES.forEach((size) => {
      expect(() => renderSync(<MicGlyph size={size} color="#FFFFFF" />)).not.toThrow();
    });
  });
});

describe('OnboardingArt', () => {
  it('renders the phone, mic button and both cards at multiple sizes', () => {
    SIZES.forEach((size) => {
      const renderer = renderSync(<OnboardingArt size={size} testID="onboarding-art" />);
      expect(renderer.root.findByProps({ testID: 'onboarding-art-mic-button' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'onboarding-art-card-top' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'onboarding-art-card-bottom' })).toBeTruthy();
    });
  });
});

describe('MicPermissionArt', () => {
  function art(size: number) {
    const renderer = renderSync(<MicPermissionArt size={size} testID="permission-art" />);
    // `findByProps` dừng ở node NGOÀI CÙNG khớp testID — với `SoundWaves` đó là
    // chính component, không mang `style`. Node cuối cùng mới là cái cầm style.
    const host = (testID: string) => {
      const matches = renderer.root.findAll((node) => node.props.testID === testID);
      return matches[matches.length - 1];
    };
    const styleOf = (testID: string) => StyleSheet.flatten(host(testID).props.style);
    return { renderer, host, styleOf };
  }

  it('renders the circle, rings, waves, tick and card at multiple sizes', () => {
    SIZES.forEach((size) => {
      const renderer = renderSync(<MicPermissionArt size={size} testID="permission-art" />);
      expect(renderer.root.findByProps({ testID: 'permission-art-circle' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-ring-outer' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-waves-left' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-waves-right' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-card' })).toBeTruthy();
      expect(renderer.root.findByProps({ testID: 'permission-art-tick' })).toBeTruthy();
    });
  });

  // Ba test dưới đây thay cho việc "node có tồn tại không". Sóng âm đã từng
  // tàng hình trên máy thật trong khi chính file này báo xanh: react-test-
  // renderer không chạy layout engine, nên nó không nhìn ra một node bị đè.
  // Vậy thì phải chốt đúng cái THUỘC TÍNH CẤU TRÚC làm nó tàng hình.
  it('anchors the absolute sound waves to a stage as wide as the whole art', () => {
    SIZES.forEach((size) => {
      const { styleOf } = art(size);
      const left = styleOf('permission-art-waves-left');
      const right = styleOf('permission-art-waves-right');

      // Không có `width` thì stage co lại bằng vòng tròn mic, `left`/`right`
      // của sóng âm neo vào hộp hẹp đó và sóng rơi đè lên chính vòng tròn.
      expect(styleOf('permission-art-stage').width).toBe(size);
      expect(left.position).toBe('absolute');
      expect(right.position).toBe('absolute');
      expect(left.left).toBe(right.right);
    });
  });

  it('keeps both wave clusters clear of the mic circle', () => {
    SIZES.forEach((size) => {
      const { styleOf } = art(size);
      const stageWidth = styleOf('permission-art-stage').width as number;
      const circleWidth = styleOf('permission-art-circle').width as number;
      const circleLeftEdge = (stageWidth - circleWidth) / 2;

      // Mép trong của cụm sóng phải nằm ngoài vòng tròn — đây là điều kiện
      // duy nhất khiến chúng thật sự nhìn thấy được trên màn hình.
      expect(styleOf('permission-art-waves-left').left).toBeLessThan(circleLeftEdge);
      expect(styleOf('permission-art-waves-right').right).toBeLessThan(circleLeftEdge);
    });
  });

  it('draws the tick as a rounded square holding a two-bar checkmark, not a status dot', () => {
    const { host, styleOf } = art(220);
    const tick = styleOf('permission-art-tick');

    // `borderRadius: tickSize / 2` là chấm tròn. Design vẽ ô vuông bo góc.
    expect(tick.borderRadius).toBeLessThan((tick.width as number) / 2);
    expect(tick.backgroundColor).toBe(colors.textMuted);
    expect(tick.backgroundColor).not.toBe(colors.success);

    const rotations = host('permission-art-tick')
      .findAll(
        (node) =>
          typeof node.type === 'string' && Boolean(StyleSheet.flatten(node.props.style)?.transform),
      )
      .map((bar) => StyleSheet.flatten(bar.props.style).transform[0].rotate)
      .sort();
    expect(rotations).toEqual(['-45deg', '45deg']);
  });

  it('lays the card out as a row with the tick first, the way the design draws it', () => {
    const { host, styleOf } = art(220);

    // Thiếu `flexDirection` thì mặc định là cột: tick nổi lên trên hai vạch.
    expect(styleOf('permission-art-card').flexDirection).toBe('row');
    expect(host('permission-art-card').children[0]).toHaveProperty(
      'props.testID',
      'permission-art-tick',
    );
  });
});
