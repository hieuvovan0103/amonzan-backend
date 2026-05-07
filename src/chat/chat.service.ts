import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MessageDto } from './dto/chat-message.dto';

const SYSTEM_PROMPT = `Bạn là một trợ lý tư vấn cosplay chuyên nghiệp và thân thiện, tên là "Cosplay AI".
Bạn có kiến thức sâu rộng về:
- Cosplay là gì, lịch sử và văn hóa cosplay
- Các nhân vật anime, manga, game, phim phổ biến
- Cách chọn trang phục, vật liệu, may đo cosplay
- Cách làm đạo cụ (props), vũ khí giả, phụ kiện
- Trang điểm (makeup) cho cosplay
- Địa điểm mua trang phục và phụ kiện cosplay
- Các sự kiện cosplay, hội thi cosplay
- Mẹo chụp ảnh cosplay, tạo dáng

Luôn trả lời bằng tiếng Việt, thân thiện và nhiệt tình. Nếu câu hỏi không liên quan đến cosplay, hãy nhẹ nhàng hướng người dùng quay lại chủ đề cosplay.`;

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 1200;
const DEFAULT_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

@Injectable()
export class ChatService {
  // Lazy init — chỉ khởi tạo khi cần, tránh crash boot nếu thiếu 1 API key
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getOpenAIClient(): OpenAI {
    if (!this.openaiClient) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey)
        throw new InternalServerErrorException(
          'OPENAI_API_KEY chưa được cấu hình.',
        );
      this.openaiClient = new OpenAI({ apiKey });
    }
    return this.openaiClient;
  }

  private getGeminiClient(): GoogleGenerativeAI {
    if (!this.geminiClient) {
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      if (!apiKey)
        throw new InternalServerErrorException(
          'GEMINI_API_KEY chưa được cấu hình.',
        );
      this.geminiClient = new GoogleGenerativeAI(apiKey);
    }
    return this.geminiClient;
  }

  private hasOpenAIKey() {
    return Boolean(this.configService.get<string>('OPENAI_API_KEY'));
  }

  private hasGeminiKey() {
    return Boolean(this.configService.get<string>('GEMINI_API_KEY'));
  }

  async sendMessage(
    messages: MessageDto[],
    model: 'openai' | 'gemini' = 'openai',
  ): Promise<string> {
    if (!messages || messages.length === 0) {
      return 'Vui lòng nhập câu hỏi của bạn.';
    }
    const safeMessages = messages
      .slice(-MAX_MESSAGES)
      .map((message) => ({
        role: message.role,
        content: message.content.trim().slice(0, MAX_MESSAGE_LENGTH),
      }))
      .filter((message) => message.content.length > 0);

    if (
      safeMessages.length === 0 ||
      safeMessages[safeMessages.length - 1].role !== 'user'
    ) {
      throw new BadRequestException('Tin nhắn chatbot không hợp lệ.');
    }

    const providers: Array<'openai' | 'gemini'> =
      model === 'gemini' ? ['gemini', 'openai'] : ['openai', 'gemini'];
    const availableProviders = providers.filter((provider) =>
      provider === 'gemini' ? this.hasGeminiKey() : this.hasOpenAIKey(),
    );

    if (availableProviders.length === 0) {
      throw new ServiceUnavailableException(
        'Chatbot chưa được cấu hình API key. Vui lòng thêm GEMINI_API_KEY hoặc OPENAI_API_KEY trong backend/.env.',
      );
    }

    let lastError: unknown = null;
    for (const provider of availableProviders) {
      try {
        return provider === 'gemini'
          ? await this.sendWithGemini(safeMessages)
          : await this.sendWithOpenAI(safeMessages);
      } catch (error: unknown) {
        lastError = error;
        console.error(`[ChatService] ${provider} failed`, error);
      }
    }

    throw new ServiceUnavailableException(
      lastError instanceof Error
        ? `Chatbot đang lỗi từ nhà cung cấp AI: ${lastError.message}`
        : 'Chatbot đang lỗi từ nhà cung cấp AI. Vui lòng thử lại sau.',
    );
  }

  private async sendWithOpenAI(messages: MessageDto[]): Promise<string> {
    const completion = await this.getOpenAIClient().chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 1000,
    });

    return (
      completion.choices[0]?.message?.content ??
      'Xin lỗi, tôi không thể trả lời lúc này.'
    );
  }

  private async sendWithGemini(messages: MessageDto[]): Promise<string> {
    const lastMessage = messages[messages.length - 1].content;
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const configuredModel = this.configService.get<string>('GEMINI_MODEL');
    const modelCandidates = [configuredModel, ...DEFAULT_GEMINI_MODELS].filter(
      (value, index, values): value is string =>
        Boolean(value && values.indexOf(value) === index),
    );

    let lastError: unknown = null;
    for (const model of modelCandidates) {
      try {
        const geminiModel = this.getGeminiClient().getGenerativeModel({
          model,
          systemInstruction: SYSTEM_PROMPT,
        });
        const chat = geminiModel.startChat({ history });
        const result = await chat.sendMessage(lastMessage);
        return result.response.text();
      } catch (error: unknown) {
        lastError = error;
        console.error(`[ChatService] Gemini model ${model} failed`, error);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new ServiceUnavailableException('Gemini không trả lời được lúc này.');
  }
}
