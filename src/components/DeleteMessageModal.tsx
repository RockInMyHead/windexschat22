import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Trash2 } from "lucide-react";

interface DeleteMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export const DeleteMessageModal = ({ isOpen, onClose, onConfirm, isLoading = false }: DeleteMessageModalProps) => {
  React.useEffect(() => {
    if (isOpen) {
      console.log('🗑️ DeleteMessageModal opened');
    }
  }, [isOpen]);

  const handleConfirm = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🗑️ Delete button clicked, isLoading:', isLoading);
    if (!isLoading) {
      try {
        console.log('🗑️ Calling onConfirm...');
        await onConfirm();
        console.log('✅ onConfirm completed');
      } catch (error) {
        console.error('❌ Error in delete confirmation:', error);
      }
    } else {
      console.log('⏳ Delete is already in progress, ignoring click');
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && !isLoading) {
      onClose();
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange} modal={true}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Подтверждение удаления
          </DialogTitle>
          <DialogDescription className="text-left">
            Вы действительно хотите удалить это сообщение? Это действие нельзя отменить.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <Trash2 className="h-5 w-5 text-destructive flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Сообщение будет удалено навсегда</p>
              <p className="text-muted-foreground">Это действие необратимо</p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Удаление...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};