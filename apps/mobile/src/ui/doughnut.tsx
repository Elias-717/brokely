import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { fonts, type } from "./theme";
import { useTheme } from "./theme-context";

export interface Slice {
  readonly key: string;
  readonly value: number;
  readonly color: string;
  readonly label: string;
}

const polar = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.sin(angle),
  y: cy - r * Math.cos(angle),
});

/** One ring segment from angle a to b (radians, clockwise from 12 o'clock). */
function segment(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  a: number,
  b: number,
): string {
  // A full circle can't be one arc; split it in two.
  if (b - a >= Math.PI * 2 - 1e-6) {
    const mid = a + Math.PI;
    return `${segment(cx, cy, outer, inner, a, mid)} ${segment(cx, cy, outer, inner, mid, b)}`;
  }
  const large = b - a > Math.PI ? 1 : 0;
  const o1 = polar(cx, cy, outer, a);
  const o2 = polar(cx, cy, outer, b);
  const i1 = polar(cx, cy, inner, b);
  const i2 = polar(cx, cy, inner, a);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    "Z",
  ].join(" ");
}

/**
 * Spending doughnut (FR-INS-03/04): slices in the order given, a 2 px card-coloured gap between
 * them, a thick ink outline (D-31), the total in the middle. Tapping a slice selects it; the
 * selected one is pulled out slightly. The legend beside it carries names, RM and %, so colour
 * is never the only cue.
 */
export function Doughnut({
  slices,
  centre,
  centreLabel,
  selected,
  onSelect,
  size = 200,
}: {
  slices: readonly Slice[];
  centre: string;
  centreLabel: string;
  selected: string | null;
  onSelect: (key: string) => void;
  size?: number;
}) {
  const { colors } = useTheme();
  const c = size / 2;
  const outer = c - 6;
  const inner = outer * 0.6;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  let angle = 0;
  const paths = slices.map((s) => {
    const start = angle;
    angle += total > 0 ? (s.value / total) * Math.PI * 2 : 0;
    const pulled = selected === s.key && slices.length > 1;
    const mid = (start + angle) / 2;
    const shift = pulled ? polar(0, 0, 5, mid) : { x: 0, y: 0 };
    return { s, d: segment(c + shift.x, c + shift.y, outer, inner, start, angle) };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {total === 0 ? (
          <Circle
            cx={c}
            cy={c}
            r={(outer + inner) / 2}
            stroke={colors.cardTint}
            strokeWidth={outer - inner}
            fill="none"
          />
        ) : (
          paths.map(({ s, d }) => (
            <Path
              key={s.key}
              d={d}
              fill={s.color}
              stroke={colors.card}
              strokeWidth={2}
              onPress={() => onSelect(s.key)}
            />
          ))
        )}
        <Circle cx={c} cy={c} r={outer + 1} stroke={colors.outline} strokeWidth={2} fill="none" />
        <Circle cx={c} cy={c} r={inner - 1} stroke={colors.outline} strokeWidth={2} fill="none" />
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[type.small, { color: colors.muted }]}>{centreLabel}</Text>
        <Text
          style={{
            fontFamily: fonts.heading,
            fontSize: 22,
            color: colors.text,
            fontVariant: ["tabular-nums"],
          }}
        >
          {centre}
        </Text>
      </View>
    </View>
  );
}
