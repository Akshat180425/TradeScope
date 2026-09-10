import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
export default function Modal({ open, onClose, title, description, children }) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className="modal">
          <div className="section-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog" title="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="modal-description">{description}</Dialog.Description>
          )}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
