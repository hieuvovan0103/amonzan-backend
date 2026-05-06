import { Injectable, InternalServerErrorException } from '@nestjs/common';
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

@Injectable()
export class ChatService {
  // Lazy init — chỉ khởi tạo khi cần, tránh crash boot nếu thiếu 1 API key
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getOpenAIClient(): OpenAI {
    if (!this.openaiClient) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY chưa được cấu hình.');
      this.openaiClient = new OpenAI({ apiKey });
    }
    return this.openaiClient;
  }

  private getGeminiClient(): GoogleGenerativeAI {
    if (!this.geminiClient) {
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      if (!apiKey) throw new InternalServerErrorException('GEMINI_API_KEY chưa được cấu hình.');
      this.geminiClient = new GoogleGenerativeAI(apiKey);
    }
    return this.geminiClient;
  }

  async sendMessage(messages: MessageDto[], model: 'openai' | 'gemini' = 'openai'): Promise<string> {
    if (!messages || messages.length === 0) {
      return 'Vui lòng nhập câu hỏi của bạn.';
    }
    if (model === 'gemini') {
      return this.sendWithGemini(messages);
    }
    return this.sendWithOpenAI(messages);
  }

  private async sendWithOpenAI(messages: MessageDto[]): Promise<string> {
    const completion = await this.getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      max_tokens: 1000,
    });

    return completion.choices[0]?.message?.content ?? 'Xin lỗi, tôi không thể trả lời lúc này.';
  }

  private async sendWithGemini(messages: MessageDto[]): Promise<string> {
    const geminiModel = this.getGeminiClient().getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    const lastMessage = messages[messages.length - 1].content;

    // History là tất cả trừ tin cuối, convert role 'assistant' → 'model' theo Gemini format
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const chat = geminiModel.startChat({ history });
    const result = await chat.sendMessage(lastMessage);
    return result.response.text();
  }
}
