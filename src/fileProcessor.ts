import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Настраиваем PDF.js для работы в браузере
// Используем локальный worker файл из public папки
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface ProcessedFile {
  text: string;
  fileName: string;
  fileType: string;
  success: boolean;
  error?: string;
}

export class FileProcessor {
  private static ocrWorker: Tesseract.Worker | null = null;

  /**
   * Инициализирует OCR worker
   */
  private static async initOCR(): Promise<Tesseract.Worker> {
    if (!this.ocrWorker) {
      this.ocrWorker = await createWorker('rus+eng'); // Поддержка русского и английского
      await this.ocrWorker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя0123456789 .,;:!?()-"',
      });
    }
    return this.ocrWorker;
  }

  /**
   * Обрабатывает файл и извлекает текст
   */
  static async processFile(file: File): Promise<ProcessedFile> {
    const fileName = file.name;
    const fileType = file.type.toLowerCase();

    try {
      // Определяем тип файла и обрабатываем соответствующим образом
      if (fileType.includes('pdf')) {
        return await this.processPDF(file, fileName);
      } else if (fileType.includes('docx') || fileType.includes('doc') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
        return await this.processDOCX(file, fileName);
      } else if (fileType.includes('txt') || fileName.endsWith('.txt')) {
        return await this.processTXT(file, fileName);
      } else if (fileType.includes('image/') || this.isImageFile(fileName)) {
        return await this.processImage(file, fileName);
      } else {
        return {
          text: '',
          fileName,
          fileType,
          success: false,
          error: 'Неподдерживаемый тип файла. Поддерживаются: PDF, DOCX, TXT, изображения (PNG, JPG, JPEG)',
        };
      }
    } catch (error) {
      console.error('Error processing file:', error);
      return {
        text: '',
        fileName,
        fileType,
        success: false,
        error: `Ошибка обработки файла: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      };
    }
  }

  /**
   * Обрабатывает PDF файлы
   */
  private static async processPDF(file: File, fileName: string): Promise<ProcessedFile> {
    try {
      const arrayBuffer = await file.arrayBuffer();

      // Загружаем PDF документ
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';

      // Обрабатываем каждую страницу
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);

        // Извлекаем текст со страницы
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');

        fullText += pageText + '\n';
      }

      return {
        text: fullText.trim(),
        fileName,
        fileType: 'pdf',
        success: true,
      };
    } catch (error) {
      return {
        text: '',
        fileName,
        fileType: 'pdf',
        success: false,
        error: `Ошибка чтения PDF: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      };
    }
  }

  /**
   * Обрабатывает DOCX файлы
   */
  private static async processDOCX(file: File, fileName: string): Promise<ProcessedFile> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });

      return {
        text: result.value,
        fileName,
        fileType: 'docx',
        success: true,
      };
    } catch (error) {
      return {
        text: '',
        fileName,
        fileType: 'docx',
        success: false,
        error: `Ошибка чтения DOCX: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      };
    }
  }

  /**
   * Обрабатывает текстовые файлы
   */
  private static async processTXT(file: File, fileName: string): Promise<ProcessedFile> {
    try {
      const text = await file.text();
      return {
        text,
        fileName,
        fileType: 'txt',
        success: true,
      };
    } catch (error) {
      return {
        text: '',
        fileName,
        fileType: 'txt',
        success: false,
        error: `Ошибка чтения TXT: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      };
    }
  }

  /**
   * Обрабатывает изображения с помощью OCR
   */
  private static async processImage(file: File, fileName: string): Promise<ProcessedFile> {
    try {
      const worker = await this.initOCR();

      // Конвертируем файл в URL для Tesseract
      const fileUrl = URL.createObjectURL(file);

      const { data: { text } } = await worker.recognize(fileUrl);

      // Освобождаем URL
      URL.revokeObjectURL(fileUrl);

      return {
        text: text.trim(),
        fileName,
        fileType: this.getImageType(fileName),
        success: true,
      };
    } catch (error) {
      return {
        text: '',
        fileName,
        fileType: this.getImageType(fileName),
        success: false,
        error: `Ошибка распознавания изображения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      };
    }
  }

  /**
   * Определяет, является ли файл изображением по расширению
   */
  private static isImageFile(fileName: string): boolean {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'];
    return imageExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  /**
   * Получает тип изображения
   */
  private static getImageType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext || 'image';
  }

  /**
   * Очищает ресурсы OCR
   */
  static async cleanup(): Promise<void> {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
    }
  }

  /**
   * Проверяет, поддерживается ли тип файла
   */
  static isSupportedFileType(file: File): boolean {
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();

    // Поддерживаемые типы
    const supportedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/',
    ];

    // Проверка по MIME типу
    if (supportedTypes.some(type => fileType.includes(type))) {
      return true;
    }

    // Проверка по расширению для изображений
    return this.isImageFile(fileName);
  }

  /**
   * Получает описание поддерживаемых типов файлов
   */
  static getSupportedFileTypesDescription(): string {
    return 'Поддерживаемые форматы: PDF, DOCX, TXT, изображения (PNG, JPG, JPEG, BMP, TIFF, WebP)';
  }
}
