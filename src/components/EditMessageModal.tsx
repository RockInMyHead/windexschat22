import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Edit2, Loader2, Pen } from "lucide-react";

interface EditMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (content: string) => void | Promise<void>;
  initialContent: string;
  isLoading?: boolean;
}

export const EditMessageModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  initialContent,
  isLoading = false 
}: EditMessageModalProps) => {
  const [content, setContent] = useState(initialContent);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent);
      // Фокус на textarea после открытия
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(
          textareaRef.current.value.length,
          textareaRef.current.value.length
        );
      }, 100);
    }
  }, [isOpen, initialContent]);

  const handleConfirm = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('✏️ EditModal: handleConfirm called', { isLoading, contentLength: content.trim().length });
    
    if (!isLoading && content.trim()) {
      try {
        console.log('✏️ EditModal: Calling onConfirm with content:', content.trim().substring(0, 50) + '...');
        await onConfirm(content.trim());
        console.log('✏️ EditModal: onConfirm completed successfully');
      } catch (error) {
        console.error('❌ EditModal: Error in edit confirmation:', error);
        alert('Ошибка при сохранении: ' + (error instanceof Error ? error.message : String(error)));
      }
    } else {
      console.warn('✏️ EditModal: Cannot confirm - isLoading:', isLoading, 'content empty:', !content.trim());
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && !isLoading) {
      onClose();
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
      setContent(initialContent);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent 
        className="sm:max-w-[600px]"
        onInteractOutside={(e) => {
          // Предотвращаем закрытие при клике вне модального окна во время загрузки
          if (isLoading) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            Редактировать сообщение
          </DialogTitle>
          <DialogDescription>
            Отредактируйте текст сообщения. Изменения будут сохранены в истории диалога.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Введите текст сообщения..."
              className="min-h-[200px] resize-none"
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (!isLoading && content.trim()) {
                    handleConfirm(e as any);
                  }
                }
                if (e.key === 'Escape' && !isLoading) {
                  handleCancel();
                }
              }}
            />
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
              onClick={(e) => {
                console.log('✏️ EditModal: Save button clicked directly', {
                  isLoading,
                  contentLength: content.trim().length,
                  disabled: isLoading || !content.trim()
                });
                if (!isLoading && content.trim()) {
                  handleConfirm(e);
                } else {
                  console.warn('✏️ EditModal: Button click ignored - button is disabled');
                }
              }}
              disabled={isLoading || !content.trim()}
              className="flex-1 sm:flex-none"
              title={!content.trim() ? 'Введите текст для сохранения' : 'Сохранить изменения'}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Pen className="h-4 w-4 mr-2" />
                  Сохранить
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
