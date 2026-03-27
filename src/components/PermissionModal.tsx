import React from "react";

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
}

export default function PermissionModal({ 
  isOpen, 
  onClose, 
  message = "No tiene los permisos, contacte a personal autorizado" 
}: PermissionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay z-[100]" onClick={onClose}>
      <div 
        className="modal-content animate-scale-in max-w-sm text-center p-8" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <i className="fa-solid fa-shield-xmark text-4xl text-destructive" />
        </div>
        
        <h3 className="text-xl font-bold text-foreground mb-3">Acceso Restringido</h3>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          {message}
        </p>

        <button 
          onClick={onClose}
          className="touch-btn w-full py-4 bg-foreground text-background font-bold rounded-2xl hover:opacity-90 transition-opacity"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
