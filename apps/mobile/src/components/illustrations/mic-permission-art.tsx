import { View } from 'react-native';
import { BrandFill } from './brand-fill';
import { colors } from '../../theme/colors';
import { Arc } from './arc';
import { MicGlyph } from './mic-glyph';

/**
 * Screen 3's hero illustration: concentric peach rings behind a large orange
 * circle holding a white `MicGlyph`, a pair of sound-wave arcs sitting clear of
 * that circle on each side, and a white card underneath laying a grey checkbox
 * beside two text-line placeholders (design.png, "3. Quyền truy cập").
 *
 * Mọi tỉ lệ dưới đây đo trực tiếp từ design.png rồi quy về `size`.
 */
export interface MicPermissionArtProps {
  size: number;
  testID?: string;
}

/** Vòng tròn peach mờ phía sau mic. */
function Ring({ size, thickness, testID }: { size: number; thickness: number; testID?: string }) {
  return (
    <View testID={testID} style={{ position: 'absolute' }}>
      <Arc size={size} arcSpan="full" color={colors.primaryTint} thickness={thickness} />
    </View>
  );
}

/** Vạch xám giả chỗ của một dòng chữ trong thẻ trắng. */
function PlaceholderLine({ size }: { size: number }) {
  return <View style={{ height: size, borderRadius: size / 2, backgroundColor: colors.border }} />;
}

interface SoundWavesProps {
  size: number;
  side: 'left' | 'right';
  /** Khoảng cách từ mép hộp `stage` vào tới hộp cung sóng. */
  inset: number;
  testID?: string;
}

/**
 * Hai cung sóng âm đồng tâm ở một bên mic.
 *
 * `quarter` chứ không phải `half`: trong design mỗi nét chỉ quét chừng 75–90°,
 * nửa đường tròn sẽ thành dấu ngoặc dài gấp đôi. `rotation` xoay đỉnh cung ra
 * phía ngoài — 270° là 9 giờ (bên trái), 90° là 3 giờ (bên phải).
 */
function SoundWaves({ size, side, inset, testID }: SoundWavesProps) {
  const rotation = side === 'left' ? 270 : 90;
  const thickness = size * 0.07;

  return (
    <View
      testID={testID}
      style={{
        position: 'absolute',
        left: side === 'left' ? inset : undefined,
        right: side === 'right' ? inset : undefined,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {[size, size * 0.6].map((arcSize) => (
        <View key={arcSize} style={{ position: 'absolute' }}>
          <Arc
            size={arcSize}
            arcSpan="quarter"
            color={colors.primary}
            thickness={thickness}
            rotation={rotation}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Dấu ✓ trắng trong ô checkbox, dựng từ hai thanh xoay 45° — không
 * `react-native-svg` (decisions.md §5). React Native xoay quanh TÂM phần tử,
 * nên hai thanh được đặt theo tâm tính ngược từ đỉnh chữ V; đặt theo mép rồi
 * mới xoay thì hai nét trượt khỏi nhau và chỗ chụm hở ra một khe.
 */
function CheckMark({ size }: { size: number }) {
  const stroke = size * 0.1;
  const vertexX = size * 0.42;
  const vertexY = size * 0.68;
  const diagonal = Math.SQRT1_2;

  // Cả hai nét đều đi LÊN từ đỉnh, chỉ khác chiều ngang, nên `top` dùng chung.
  function bar(length: number, dirX: -1 | 1, rotate: string) {
    return {
      position: 'absolute' as const,
      left: vertexX + (dirX * diagonal * length) / 2 - length / 2,
      top: vertexY - (diagonal * length) / 2 - stroke / 2,
      width: length,
      height: stroke,
      borderRadius: stroke / 2,
      backgroundColor: colors.primaryText,
      transform: [{ rotate }],
    };
  }

  return (
    <>
      <View style={bar(size * 0.24, -1, '45deg')} />
      <View style={bar(size * 0.52, 1, '-45deg')} />
    </>
  );
}

export function MicPermissionArt({ size, testID }: MicPermissionArtProps) {
  const id = (suffix: string) => (testID ? `${testID}-${suffix}` : undefined);
  const circleSize = size * 0.42;
  const waveSize = size * 0.24;
  const waveInset = size * 0.1;
  const cardWidth = size * 0.66;
  const tickSize = size * 0.12;

  return (
    <View testID={testID} style={{ width: size, alignItems: 'center' }}>
      <View
        testID={id('stage')}
        style={{
          // `width: size` là bắt buộc, không phải trang trí: hai cụm sóng âm là
          // con `position: 'absolute'` neo `left`/`right` vào chính hộp này. Bỏ
          // width đi thì hộp co lại bằng vòng tròn mic, sóng âm rơi đè lên nó
          // rồi bị phủ kín — đúng lỗi trên máy thật mà test "node có tồn tại"
          // không thấy được.
          width: size,
          height: size * 0.62,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ring size={size * 0.62} thickness={size * 0.03} testID={id('ring-outer')} />
        <Ring size={size * 0.5} thickness={size * 0.035} testID={id('ring-inner')} />

        <BrandFill
          testID={id('circle')}
          style={{
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MicGlyph size={circleSize * 0.6} color={colors.primaryText} />
        </BrandFill>

        {/* Vẽ SAU vòng tròn: nếu tỉ lệ sau này đổi và chúng chồng nhau thì lỗi
            hiện ra thành nét đè lên mic — thấy ngay — chứ không lặng lẽ biến
            mất như lần trước. */}
        <SoundWaves size={waveSize} side="left" inset={waveInset} testID={id('waves-left')} />
        <SoundWaves size={waveSize} side="right" inset={waveInset} testID={id('waves-right')} />
      </View>

      <View
        testID={id('card')}
        style={{
          width: cardWidth,
          height: size * 0.3,
          borderRadius: 12,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          // Design xếp NGANG: ô tick bên trái, hai vạch chữ bên phải.
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: cardWidth * 0.16,
          gap: cardWidth * 0.12,
        }}
      >
        <View
          testID={id('tick')}
          style={{
            width: tickSize,
            height: tickSize,
            // Vuông bo góc, KHÔNG phải `tickSize / 2` — bán kính bằng nửa cạnh
            // biến ô checkbox thành chấm tròn trạng thái, sai hẳn ý của design.
            borderRadius: tickSize * 0.22,
            backgroundColor: colors.textMuted,
          }}
        >
          <CheckMark size={tickSize} />
        </View>
        <View style={{ flex: 1, gap: size * 0.06 }}>
          <PlaceholderLine size={size * 0.04} />
          <PlaceholderLine size={size * 0.04} />
        </View>
      </View>
    </View>
  );
}
