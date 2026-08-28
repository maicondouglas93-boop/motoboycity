import { PATH_METADATA } from '@nestjs/common/constants';
import { PublicAiqfomeController } from './aiqfome.controller';

describe('PublicAiqfomeController', () => {
  it('aceita o callback canonico e o callback registrado no provedor', () => {
    const paths = Reflect.getMetadata(
      PATH_METADATA,
      PublicAiqfomeController.prototype.callback,
    ) as string[];

    expect(paths).toEqual(['callback', 'oauth/callback']);
  });
});
