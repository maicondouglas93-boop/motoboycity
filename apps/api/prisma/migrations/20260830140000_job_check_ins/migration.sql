-- Aviso de vida de rotina externa. Aditivo: cria tabela nova, nao toca em
-- nenhuma existente. Ver o comentario do model no schema para o motivo de a
-- chave ser o nome da rotina.
-- CreateTable
CREATE TABLE "job_check_ins" (
    "id" VARCHAR(60) NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "sizeBytes" BIGINT,
    "detail" VARCHAR(200),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_check_ins_pkey" PRIMARY KEY ("id")
);
