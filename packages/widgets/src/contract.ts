// Der Vertrag eines Widget-Kerns. Framework-neutral: kein React, kein Framer.
// Der Kern rendert in einen Host (div mit canvas) und reagiert auf Props.
export type WidgetProps = Record<string, unknown>;

export interface WidgetHandle {
  // Ersetzt alle Props; nach destroy ein No-op.
  setProps(props: WidgetProps): void;
  // Gibt alle Ressourcen frei; mehrfach aufrufbar.
  destroy(): void;
}

export type WidgetMount = (host: HTMLElement, props: WidgetProps) => WidgetHandle;
