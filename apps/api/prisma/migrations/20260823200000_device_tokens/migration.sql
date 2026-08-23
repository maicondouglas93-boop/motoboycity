-- Token de push de um aparelho, para alcancar o motoboy com o app fechado.

CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- Unico no sistema inteiro, e nao por motoboy: um mesmo aparelho pode trocar de
-- dono. Sem isto, a oferta de um tocaria no celular do outro.
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");
CREATE INDEX "device_tokens_driverId_idx" ON "device_tokens"("driverId");

ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
