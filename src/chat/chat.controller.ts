import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-message.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @ApiOperation({ summary: 'Send a message to the cosplay chatbot.' })
  async sendMessage(@Body() body: ChatRequestDto) {
    const reply = await this.chatService.sendMessage(body.messages, body.model);
    return { reply };
  }
}
