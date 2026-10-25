// Einrueckung im Ebenenbaum.
//
// Der Baum ist ein Hinweis auf die Struktur, keine Zeichnung: ab einer Tiefe
// ist die Verschachtelung am Rand angekommen und weitere Einrueckung kostet
// nur noch Platz fuer den Namen. Gemessen an den drei echten Exporten:
//
//   Export                          Tiefe  Einrueckung (alt)  Zeilen ohne Platz
//   framer-stupendous-football        16             230 px                  3
//   framer-fluffy-rectangle           20             286 px                477
//   framer-easier-train               18             258 px                 62
//
// Bei einer Panelbreite von 259 px lief die Zeile ab Tiefe 18 aus dem Panel.
// Der Bezug zum Elternteil bleibt ueber Reihenfolge und Baumlinie lesbar; die
// Tiefe steht zusaetzlich in `aria-level` und ist damit fuer Screenreader
// exakt, auch wenn die Einrueckung gedeckelt ist.
const BASE_PX = 6;
const STEP_PX = 14;
// Ab hier steht die Einrueckung. 118 px + 6 px Grundrand lassen in einem
// 259-px-Panel rund 135 px fuer den Namen - genug fuer "Abschnitt" oder
// "Schaltflaeche", und die Zeile bleibt weit von der Kante.
const MAX_INDENT_PX = 118;

export function indentForDepth(depth: number): number {
  const safe = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
  return BASE_PX + Math.min(safe, Math.floor((MAX_INDENT_PX - BASE_PX) / STEP_PX)) * STEP_PX;
}
