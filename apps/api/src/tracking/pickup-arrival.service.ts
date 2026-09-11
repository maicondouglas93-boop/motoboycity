import { Injectable, Logger } from '@nestjs/common';
import type { ReportDeliveryLocationPayload } from '@motoboycity/validation';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface ArrivalDelivery {
  id: string;
  displayNumber: number;
  companyId: string;
  driverId: string | null;
  status: string;
  statusChangedAt: Date;
  pickupArrivalNotifiedAt: Date | null;
  addresses: { lat: unknown; lng: unknown }[];
}

type Observation = {
  assignment: string;
  firstSample: number;
  lastSample: number;
  firstReceived: number;
  lastReceived: number;
  samples: number;
};

function distanceMeters(lat: number, lng: number, target: { lat: number; lng: number }) {
  const radians = Math.PI / 180;
  const a =
    Math.sin(((target.lat - lat) * radians) / 2) ** 2 +
    Math.cos(lat * radians) *
      Math.cos(target.lat * radians) *
      Math.sin(((target.lng - lng) * radians) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

@Injectable()
export class PickupArrivalService {
  private readonly logger = new Logger(PickupArrivalService.name);
  // Observacoes sao descartaveis: reinicio/instancias diferentes apenas atrasam o aviso.
  // A trava duravel no pedido e a autoridade contra duplicacao.
  private readonly observations = new Map<string, Observation>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async observe(
    delivery: ArrivalDelivery,
    payload: ReportDeliveryLocationPayload,
    now = Date.now(),
  ) {
    for (const [id, observation] of this.observations) {
      if (now - observation.lastReceived > 30_000) this.observations.delete(id);
    }
    const pickup = delivery.addresses?.[0];
    const target =
      pickup?.lat != null && pickup.lng != null
        ? { lat: Number(pickup.lat), lng: Number(pickup.lng) }
        : undefined;
    if (
      delivery.status !== 'ACCEPTED' ||
      !delivery.driverId ||
      delivery.pickupArrivalNotifiedAt ||
      !target ||
      !Number.isFinite(target.lat) ||
      !Number.isFinite(target.lng) ||
      Math.abs(target.lat) > 90 ||
      Math.abs(target.lng) > 180
    ) {
      this.observations.delete(delivery.id);
      return undefined;
    }
    const { sampledAt, speedMps, accuracy } = payload;
    if (
      sampledAt === undefined ||
      speedMps === undefined ||
      accuracy === undefined ||
      accuracy <= 0 ||
      accuracy > 20 ||
      speedMps < 0 ||
      speedMps > 5 / 3.6 ||
      !Number.isFinite(sampledAt) ||
      !Number.isFinite(speedMps) ||
      !Number.isFinite(accuracy) ||
      now - sampledAt > 15_000 ||
      sampledAt - now > 5_000 ||
      sampledAt < delivery.statusChangedAt.getTime() ||
      distanceMeters(payload.lat, payload.lng, target) > 50
    ) {
      this.observations.delete(delivery.id);
      return target;
    }
    const assignment = `${delivery.driverId}:${delivery.statusChangedAt.getTime()}`;
    let observation = this.observations.get(delivery.id);
    if (observation?.assignment === assignment && sampledAt <= observation.lastSample)
      return target;
    if (
      !observation ||
      observation.assignment !== assignment ||
      sampledAt - observation.lastSample > 15_000 ||
      now - observation.lastReceived > 15_000
    ) {
      if (this.observations.size >= 3_000) this.observations.clear();
      observation = {
        assignment,
        firstSample: sampledAt,
        lastSample: sampledAt,
        firstReceived: now,
        lastReceived: now,
        samples: 1,
      };
      this.observations.set(delivery.id, observation);
      return target;
    }
    observation.lastSample = sampledAt;
    observation.lastReceived = now;
    observation.samples += 1;
    if (
      observation.samples < 3 ||
      sampledAt - observation.firstSample < 20_000 ||
      now - observation.firstReceived < 20_000
    )
      return target;

    try {
      const arrivedAt = new Date(now);
      const claimed = await this.prisma.delivery.updateMany({
        where: {
          id: delivery.id,
          driverId: delivery.driverId,
          status: 'ACCEPTED',
          statusChangedAt: delivery.statusChangedAt,
          pickupArrivalNotifiedAt: null,
        },
        data: { pickupArrivalNotifiedAt: arrivedAt },
      });
      this.observations.delete(delivery.id);
      if (claimed.count === 1)
        this.realtime.emitPickupArrival(delivery.companyId, {
          deliveryId: delivery.id,
          displayNumber: delivery.displayNumber,
          driverId: delivery.driverId,
          arrivedAt: arrivedAt.toISOString(),
        });
      return undefined;
    } catch {
      // Falha neste aviso nunca impede rastreamento, aceite, coleta ou entrega.
      this.logger.warn(`Aviso de chegada indisponivel para o pedido ${delivery.displayNumber}.`);
      return target;
    }
  }
}
