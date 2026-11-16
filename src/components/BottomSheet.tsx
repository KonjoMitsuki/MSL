import { useEffect, useId, useRef, type ReactNode } from 'react';

export function BottomSheet({ title, open, onClose, children }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.scrollTop = 0;
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="bottom-sheet" aria-labelledby={titleId} onClose={() => { if (!ref.current?.open) onClose(); }}>
    <div className="sheet-handle" aria-hidden="true" />
    <header className="sheet-heading">
      <h2 id={titleId}>{title}</h2>
      <form method="dialog"><button autoFocus aria-label="閉じる" className="icon-button">×</button></form>
    </header>
    <div className="sheet-body">{children}</div>
  </dialog>;
}
