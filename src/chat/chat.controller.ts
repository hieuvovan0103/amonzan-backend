import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(SupabaseAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @ApiOperation({ summary: 'Send a message to the cosplay chatbot.' })
  async sendMessage(@Body() body: ChatRequestDto) {
    const reply = await this.chatService.sendMessage(body.messages, body.model);
    return { reply };
  }
}
