import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Copy, Loader2, FileText } from "lucide-react";

// Safe copy to clipboard helper
const safeCopyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const result = document.execCommand('copy');
      textArea.remove();
      return result;
    }
  } catch (error) {
    console.error('Failed to copy text:', error);
    return false;
  }
};

interface ChatSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string;
  isLoading: boolean;
  chatTitle?: string;
}

export const ChatSummaryModal: React.FC<ChatSummaryModalProps> = ({
  isOpen,
  onClose,
  summary,
  isLoading,
  chatTitle
}) => {
  const handleDownload = () => {
    const content = `Резюме чата${chatTitle ? ` "${chatTitle}"` : ''}\n\n${summary}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-summary${chatTitle ? `-${chatTitle.replace(/[^a-zA-Z0-9]/g, '-')}` : ''}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const success = await safeCopyToClipboard(summary);
    if (success) {
      console.log('Резюме скопировано');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📋 Резюме чата
          </DialogTitle>
          <DialogDescription>
            Логичное и подробное резюме всего общения в чате
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={isLoading || !summary}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Скачать
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={isLoading || !summary}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            Копировать
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh] overflow-y-auto pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Создаю резюме чата...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Анализирую все сообщения для создания логичного и подробного резюме
                </p>
              </div>
            </div>
          ) : summary ? (
            summary.startsWith('Ошибка при создании резюме:') || summary.startsWith('Не удалось создать резюме') ? (
              <div className="text-center py-12">
                <div className="text-destructive mb-2">
                  <p className="font-medium">❌ {summary}</p>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Попробуйте обновить страницу и создать резюме снова
                </p>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {summary}
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Резюме пока не создано</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
