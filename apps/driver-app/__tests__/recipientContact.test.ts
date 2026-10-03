import { Alert, Linking } from 'react-native';
import { openWhatsApp, whatsappNumber } from '../src/lib/recipientContact';

describe('número do WhatsApp a partir do telefone do pedido', () => {
  it('põe o 55 na frente do número com DDD, venha formatado como vier', () => {
    expect(whatsappNumber('(28) 99999-0000')).toBe('5528999990000');
    expect(whatsappNumber('28 3522-1234')).toBe('552835221234');
    expect(whatsappNumber('028999990000')).toBe('5528999990000');
  });

  it('não duplica o 55 de quem já mandou com DDI', () => {
    expect(whatsappNumber('+55 28 99999-0000')).toBe('5528999990000');
    expect(whatsappNumber('5528999990000')).toBe('5528999990000');
  });

  it('DDD 55 (Rio Grande do Sul) continua sendo DDD', () => {
    expect(whatsappNumber('(55) 99999-0000')).toBe('5555999990000');
  });

  it('respeita número de outro país escrito com +', () => {
    expect(whatsappNumber('+351 912 345 678')).toBe('351912345678');
  });

  it('sem DDD não há como saber de onde é', () => {
    expect(whatsappNumber('99999-0000')).toBeNull();
    expect(whatsappNumber('3522-1234')).toBeNull();
  });
});

describe('abrir o WhatsApp do cliente', () => {
  let openURL: jest.SpyInstance;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('vai direto ao aplicativo do WhatsApp, sem passar pelo navegador', async () => {
    await openWhatsApp('(28) 99999-0000');

    expect(openURL).toHaveBeenCalledWith('whatsapp://send?phone=5528999990000');
    expect(alert).not.toHaveBeenCalled();
  });

  it('sem WhatsApp instalado, oferece a ligação comum', async () => {
    openURL.mockRejectedValueOnce(new Error('No Activity found'));

    await openWhatsApp('(28) 99999-0000');

    expect(alert).toHaveBeenCalledWith(
      'WhatsApp não encontrado',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Ligar' })]),
    );
    const ligar = alert.mock.calls[0][2].find((botao: { text: string }) => botao.text === 'Ligar');
    ligar.onPress();
    await Promise.resolve();
    expect(openURL).toHaveBeenLastCalledWith('tel:28999990000');
  });

  it('número sem DDD nem tenta o WhatsApp: oferece ligar', async () => {
    await openWhatsApp('99999-0000');

    expect(openURL).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Número sem DDD', expect.any(String), expect.any(Array));
  });
});
