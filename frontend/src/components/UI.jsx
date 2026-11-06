import { Component, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
export function Icon({ name = 'dashboard', size = 20 }) {
  const paths = {
    chat: 'M4 3h16v13H9l-5 5zM8 7h8M8 11h5',
    moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
    refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1',
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    movements: 'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4',
    document: 'M14 2H5v20h14V7z M14 2v5h5M8 12h8M8 16h8',
    bulk: 'M3 7h18v14H3z M3 7l3-4h12l3 4M9 12l3-3 3 3M12 9v8',
    goals: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M16 4h4v4',
    expenses: 'M3 5h18v14H3z M3 9h18M15 15h3',
    compare: 'M8 3v18M16 3v18M3 7h10M11 17h10',
    simulator: 'M5 2h14v20H5zM8 6h8M8 11h1M15 11h1M8 15h1M15 15h1M8 19h1M15 19h1',
    arrow: 'M5 12h14M14 7l5 5-5 5', plus: 'M12 5v14M5 12h14',
    up: 'M7 17 17 7M7 7h10v10', down: 'M7 7l10 10M7 17h10V7',
    search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',
    menu: 'M4 6h16M4 12h16M4 18h16', close: 'M6 6l12 12M6 18 18 6',
    check: 'M4 12l5 5L20 6', edit: 'm4 16-1 5 5-1L21 7l-4-4zM14 6l4 4',
    trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7'
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.document}/></svg>;
}
export function Notice({ children, error = false }) { return <div className={`notice ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{children}</div>; }
export function Empty({ title, children, action }) { return <div className="empty-panel"><span className="empty-mark"><Icon name="document" size={28}/></span><h3>{title}</h3><p>{children}</p>{action}</div>; }
export function Skeleton({ rows = 3 }) { return <div className="skeleton-stack" role="status" aria-label="Cargando datos">{Array.from({ length: rows }, (_, i) => <div className="skeleton" key={i}/>)}</div>; }
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null); const id = useId();
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement; dialog.showModal(); return () => { dialog.close(); previous?.focus(); }; }, []);
  return createPortal(<dialog ref={ref} className={`product-dialog ${wide ? 'wide' : ''}`} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="dialog-heading"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="Cerrar ventana" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>, document.body);
}
export class ErrorBoundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <Empty title="Esta pantalla no pudo cargarse" action={<button onClick={() => this.setState({ error: false })}>Reintentar</button>}>Intentá nuevamente. Tus registros guardados siguen disponibles.</Empty> : this.props.children; }
}
