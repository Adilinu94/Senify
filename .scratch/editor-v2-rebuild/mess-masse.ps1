# Mass-Analyse der Referenzbilder (nur lesend).
#
# Vorher wurden Fenster geraten und die Formen darin gesucht — dabei traf ein
# Fenster die Form nicht, und das Ergebnis war still falsch. Jetzt sucht das
# Werkzeug die Formen selbst:
#
#   1. Je Zeile zusammenhaengende Laufe einer Zielfarbe sammeln (Toleranz).
#   2. Laufe benachbarter Zeilen, die sich ueberlappen, zu einer Form
#      verschmelzen (Union-Find).
#   3. Je Form Huellrechteck, Flaeche und Eckradius bestimmen.
#
# Der Radius entsteht aus dem Muster der linken Kante: bei einem gerundeten
# Rechteck erreicht sie ihre tiefste Stelle nach genau radius Zeilen, bei einer
# Pille in der halben Hoehe. Beide Faelle liefert dieselbe Rechnung richtig.
#
# Das Rechnen steckt in C# (Add-Type), weil PowerShell fuer 7,5 Millionen Pixel
# je Bild zu langsam ist. Aufruf:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File mess-masse.ps1

$ErrorActionPreference = "Stop"
Add-Type -ReferencedAssemblies "System.Drawing.dll" -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

public static class Messer
{
    private static int Find(int[] parent, int i)
    {
        while (parent[i] != i) { parent[i] = parent[parent[i]]; i = parent[i]; }
        return i;
    }

    private static void Union(int[] parent, int a, int b)
    {
        int ra = Find(parent, a);
        int rb = Find(parent, b);
        if (ra != rb) parent[rb] = ra;
    }

    public static string Bericht(string pfad, string[] namen, string[] hexen, int[] tols, int schwelle)
    {
        Bitmap bmp = new Bitmap(pfad);
        int w = bmp.Width;
        int h = bmp.Height;
        Rectangle rect = new Rectangle(0, 0, w, h);
        Bitmap clone = bmp.Clone(rect, PixelFormat.Format24bppRgb);
        bmp.Dispose();
        BitmapData daten = clone.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        int stride = daten.Stride;
        byte[] bytes = new byte[stride * h];
        Marshal.Copy(daten.Scan0, bytes, 0, bytes.Length);
        clone.UnlockBits(daten);
        clone.Dispose();

        StringBuilder sb = new StringBuilder();
        sb.AppendLine();
        sb.AppendLine("======================================================================");
        sb.AppendLine("BILD: " + pfad);
        sb.AppendLine("GROESSE: " + w + " x " + h + " px   (Bild ist doppelt aufgeloest, CSS = px / 2)");
        sb.AppendLine("======================================================================");

        for (int t = 0; t < namen.Length; t++)
        {
            int tr = Convert.ToInt32(hexen[t].Substring(1, 2), 16);
            int tg = Convert.ToInt32(hexen[t].Substring(3, 2), 16);
            int tb = Convert.ToInt32(hexen[t].Substring(5, 2), 16);
            int tol = tols[t];

            // --- Laeufe je Zeile ------------------------------------------
            List<List<int[]>> jeZeile = new List<List<int[]>>(h);
            for (int y = 0; y < h; y++)
            {
                List<int[]> zeile = new List<int[]>();
                int row = y * stride;
                int start = -1;
                for (int x = 0; x < w; x++)
                {
                    int i = row + x * 3;
                    bool passt =
                        Math.Abs((int)bytes[i] - tb) <= tol &&
                        Math.Abs((int)bytes[i + 1] - tg) <= tol &&
                        Math.Abs((int)bytes[i + 2] - tr) <= tol;
                    if (passt) { if (start < 0) start = x; }
                    else if (start >= 0) { zeile.Add(new int[] { start, x - 1 }); start = -1; }
                }
                if (start >= 0) zeile.Add(new int[] { start, w - 1 });
                jeZeile.Add(zeile);
            }

            // --- Alles in eine Liste, Zeilenbereich merken -----------------
            List<int[]> alle = new List<int[]>();
            int[] zeileAb = new int[h];
            for (int y = 0; y < h; y++)
            {
                zeileAb[y] = alle.Count;
                foreach (int[] r in jeZeile[y]) alle.Add(new int[] { y, r[0], r[1] });
            }
            int n = alle.Count;
            int[] parent = new int[n];
            for (int i = 0; i < n; i++) parent[i] = i;

            // --- Ueberlappende Laeufe benachbarter Zeilen verschmelzen -----
            // Der Lauf mit Nummer k in Zeile y hat den Listenindex zeileAb[y]+k.
            for (int y = 0; y + 1 < h; y++)
            {
                List<int[]> oben = jeZeile[y];
                List<int[]> unten = jeZeile[y + 1];
                for (int k = 0; k < oben.Count; k++)
                {
                    for (int m = 0; m < unten.Count; m++)
                    {
                        // Ueberlappung: a endet vor b beginnt, oder umgekehrt.
                        if (!(oben[k][0] > unten[m][1] || unten[m][0] > oben[k][1]))
                        {
                            Union(parent, zeileAb[y] + k, zeileAb[y + 1] + m);
                        }
                    }
                }
            }

            // --- Formen bilden --------------------------------------------
            Dictionary<int, List<int>> gruppen = new Dictionary<int, List<int>>();
            for (int i = 0; i < n; i++)
            {
                int r = Find(parent, i);
                if (!gruppen.ContainsKey(r)) gruppen[r] = new List<int>();
                gruppen[r].Add(i);
            }

            List<string> zeilen = new List<string>();
            List<int[]> treffer = new List<int[]>();
            foreach (KeyValuePair<int, List<int>> g in gruppen)
            {
                int area = 0;
                int x0 = int.MaxValue, y0 = int.MaxValue, x1 = -1, y1 = -1;
                foreach (int i in g.Value)
                {
                    int[] r = alle[i];
                    area += r[2] - r[1] + 1;
                    if (r[1] < x0) x0 = r[1];
                    if (r[2] > x1) x1 = r[2];
                    if (r[0] < y0) y0 = r[0];
                    if (r[0] > y1) y1 = r[0];
                }
                if (area >= schwelle) treffer.Add(new int[] { area, x0, y0, x1, y1, g.Key });
            }
            treffer.Sort(delegate (int[] a, int[] b) { return b[0].CompareTo(a[0]); });

            sb.AppendLine();
            sb.AppendLine("--- " + namen[t] + " (" + hexen[t] + ", Toleranz +-" + tol + ", ab " + schwelle + " px Flaeche) ---");
            if (treffer.Count == 0) sb.AppendLine("    keine Form ueber der Schwelle");

            int gezeigt = 0;
            foreach (int[] f in treffer)
            {
                if (gezeigt >= 14) { sb.AppendLine("    ... " + (treffer.Count - gezeigt) + " weitere"); break; }
                gezeigt++;

                int x0 = f[1], y0 = f[2], x1 = f[3], y1 = f[4], root = f[5];
                int bw = x1 - x0 + 1;
                int bh = y1 - y0 + 1;

                // --- Radius, drei Schaetzer ----------------------------------
                // Keiner der drei ist allein verlaesslich:
                //
                //  Schwelle  (links <= x0 + 1):  greift bei r = 30 schon nach
                //            22 Zeilen, weil sich die Kante der Endlage erst
                //            asymptotisch naehert. Schaetzt rund 26 % zu klein.
                //  Stille    (links wandert nicht mehr): die Schrittweite
                //            faellt unter die Rundungsaufloesung, lange bevor
                //            die Kante wirklich steht — bei einer Pille mit
                //            r = 39 bereits nach 16 Zeilen. Schaetzt viel zu
                //            klein, ausgerechnet bei grossen Radien.
                //  Tangente  (links in der OBERSTEN Zeile): theoretisch exakt,
                //            denn dort gilt links - x0 = r. Nur die
                //            Antialiasing-Kante der ersten Zeile stoert.
                //
                // Deshalb alle drei. Stimmen Tangente und Schwelle ueberein
                // (Schwelle ist rund 0,74 x Tangente), ist der Wert gesichert.
                int[] zeilenMin = new int[bh];
                for (int k = 0; k < bh; k++) zeilenMin[k] = int.MaxValue;
                foreach (int i in gruppen[root])
                {
                    int k = alle[i][0] - y0;
                    if (alle[i][1] < zeilenMin[k]) zeilenMin[k] = alle[i][1];
                }

                int rTangente = zeilenMin[0] - x0;
                if (rTangente < 0) rTangente = 0;

                int rSchwelle = bh / 2;
                for (int k = 0; k < bh; k++)
                {
                    if (zeilenMin[k] <= x0 + 1) { rSchwelle = k; break; }
                }

                int rStille = bh / 2;
                for (int k = 0; k + 1 < bh; k++)
                {
                    if (zeilenMin[k] == zeilenMin[k + 1]) { rStille = k; break; }
                }

                // Form beruehrt den Bildrand: die Ecke ist dann angeschnitten.
                string rand = "";
                if (x0 <= 1 || y0 <= 1 || x1 >= w - 2 || y1 >= h - 2) rand = "  [am Bildrand]";

                // Pille: Tangente erreicht die halbe Hoehe.
                bool pille = rTangente >= (bh / 2) - 2;
                int radius = pille ? bh / 2 : rTangente;

                sb.AppendLine(string.Format(
                    "    {0,5} x {1,4} px   Radius {2,4} px{3}   Ort {4},{5}",
                    bw, bh, radius, pille ? "  (Pille)" : "        ",
                    (100.0 * x0 / w).ToString("0.0") + "%", (100.0 * y0 / h).ToString("0.0") + "%"));
                sb.AppendLine(string.Format(
                    "    CSS  {0,5} x {1,4}       Radius {2,4}      [Tangente {3}, Schwelle {4}, Stille {5}]{6}",
                    (bw / 2.0).ToString("0.0"), (bh / 2.0).ToString("0.0"), (radius / 2.0).ToString("0.0"),
                    rTangente, rSchwelle, rStille, rand));
            }
        }
        return sb.ToString();
    }

}
'@

$bilder = @(
  "C:/Users/adini/projects/nick-portal/HSzxw_Sb0AARFwe.png",
  "C:/Users/adini/projects/nick-portal/HSzxv9UaIAAOXbw.jpeg"
)
$namen = @("Weiss (Karten, Panels)", "Limette (Akzent)", "Amber (Hinweis)", "Hinweisflaeche", "Fast-schwarz (zweite Flaeche)")
$hexen = @("#ffffff", "#c9f24c", "#eca122", "#fcefd8", "#111116")
$tols = @(3, 16, 16, 10, 10)
$schwelle = 4000

foreach ($b in $bilder) {
  Write-Output ([Messer]::Bericht($b, $namen, $hexen, $tols, $schwelle))
}
