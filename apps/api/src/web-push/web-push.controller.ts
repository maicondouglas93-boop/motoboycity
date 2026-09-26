import { Controller, Get, Header } from '@nestjs/common';
import { WebPushService } from './web-push.service';

/**
 * A chave pública do Web Push, aberta: é com ela que o navegador se inscreve.
 * `null`: o push está desligado neste servidor, e as telas escondem o botão.
 * Vir daqui, e não de uma variável do painel, deixa as chaves num lugar só.
 */
@Controller('public/web-push')
export class WebPushController {
  constructor(private readonly webPush: WebPushService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  chave(): { chavePublica: string | null } {
    return { chavePublica: this.webPush.chavePublica() };
  }
}
