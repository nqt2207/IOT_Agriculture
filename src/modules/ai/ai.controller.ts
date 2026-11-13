
import {
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';

import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
  ) {}

  @Post('chat')
  async chat(
    @Req() request: any,
    @Body() dto: ChatDto,
  ) {
    const userId = Number(request.user.id);

    return this.aiService.chat(userId, dto);
  }
}
