CREATE TABLE "account" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "password_reset_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rol" text NOT NULL,
	"tipo_persona" text,
	"nombre" text,
	"ruc" text,
	"cedula" text,
	"direccion" text,
	"telefono" text,
	"representante" text,
	"estado" varchar(20) DEFAULT 'activo' NOT NULL,
	"email" text,
	"recibir_notificaciones" boolean DEFAULT true NOT NULL,
	"fecha_fin_bloqueo" timestamp with time zone,
	"motivo_bloqueo" text,
	"latitud" double precision,
	"longitud" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_rol_valido" CHECK ("usuarios"."rol" IN ('ADMINISTRADOR', 'DONANTE', 'SOLICITANTE', 'OPERADOR')),
	CONSTRAINT "usuarios_estado_valido" CHECK ("usuarios"."estado" IN ('activo', 'bloqueado', 'desactivado')),
	CONSTRAINT "usuarios_cedula_format_check" CHECK ("usuarios"."cedula" IS NULL OR "usuarios"."cedula" ~ '^[0-9]{10}$'),
	CONSTRAINT "usuarios_ruc_format_check" CHECK ("usuarios"."ruc" IS NULL OR "usuarios"."ruc" ~ '^[0-9]{13}$'),
	CONSTRAINT "usuarios_latitud_range_check" CHECK ("usuarios"."latitud" IS NULL OR "usuarios"."latitud" BETWEEN -90 AND 90),
	CONSTRAINT "usuarios_longitud_range_check" CHECK ("usuarios"."longitud" IS NULL OR "usuarios"."longitud" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "alimentos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alimentos_unidades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"alimento_id" bigint NOT NULL,
	"unidad_id" bigint NOT NULL,
	"es_unidad_principal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alimentos_unidades_alimento_unidad_key" UNIQUE("alimento_id","unidad_id")
);
--> statement-breakpoint
CREATE TABLE "conversiones" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"unidad_origen_id" bigint NOT NULL,
	"unidad_destino_id" bigint NOT NULL,
	"factor_conversion" numeric(15, 8) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversiones_origen_destino_key" UNIQUE("unidad_origen_id","unidad_destino_id"),
	CONSTRAINT "conversiones_unidades_diferentes" CHECK ("conversiones"."unidad_origen_id" <> "conversiones"."unidad_destino_id"),
	CONSTRAINT "conversiones_factor_positivo" CHECK ("conversiones"."factor_conversion" > 0)
);
--> statement-breakpoint
CREATE TABLE "tipos_magnitud" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipos_magnitud_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "unidades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"simbolo" text NOT NULL,
	"tipo_magnitud_id" bigint NOT NULL,
	"es_base" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"es_discreta" boolean DEFAULT false NOT NULL,
	"es_presentacion" boolean DEFAULT false NOT NULL,
	"permite_fraccion" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bajas_productos" (
	"id_baja" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_producto" uuid NOT NULL,
	"id_entrada" uuid,
	"cantidad_baja" numeric NOT NULL,
	"motivo_baja" text NOT NULL,
	"usuario_responsable_id" uuid NOT NULL,
	"fecha_baja" timestamp with time zone DEFAULT now(),
	"observaciones" text,
	"estado_baja" text DEFAULT 'confirmada',
	"nombre_producto" text,
	"cantidad_disponible_antes" numeric,
	"id_deposito" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bajas_cantidad_positiva" CHECK ("bajas_productos"."cantidad_baja" > 0),
	CONSTRAINT "bajas_motivo_valido" CHECK ("bajas_productos"."motivo_baja" IN ('vencido', 'dañado', 'contaminado', 'rechazado', 'otro')),
	CONSTRAINT "bajas_estado_valido" CHECK ("bajas_productos"."estado_baja" IN ('confirmada', 'pendiente_revision', 'revisada'))
);
--> statement-breakpoint
CREATE TABLE "depositos" (
	"id_deposito" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"direccion" text,
	"latitud" double precision,
	"longitud" double precision,
	"telefono" text,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donante_depositos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donante_id" uuid NOT NULL,
	"id_deposito" uuid NOT NULL,
	"es_principal" boolean DEFAULT true NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entradas_inventario" (
	"id_entrada" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donacion_id" integer,
	"donante_id" uuid,
	"id_deposito" uuid NOT NULL,
	"id_producto" uuid NOT NULL,
	"unidad_id" bigint,
	"cantidad_original" numeric NOT NULL,
	"cantidad_disponible" numeric NOT NULL,
	"fecha_vencimiento" date,
	"fecha_ingreso" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" text DEFAULT 'disponible' NOT NULL,
	"es_legacy" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entradas_cantidad_original_positiva" CHECK ("entradas_inventario"."cantidad_original" > 0),
	CONSTRAINT "entradas_cantidad_disponible_rango" CHECK ("entradas_inventario"."cantidad_disponible" >= 0 AND "entradas_inventario"."cantidad_disponible" <= "entradas_inventario"."cantidad_original"),
	CONSTRAINT "entradas_estado_valido" CHECK ("entradas_inventario"."estado" IN ('disponible', 'agotado', 'cancelado')),
	CONSTRAINT "entradas_unidad_nueva_obligatoria" CHECK ("entradas_inventario"."es_legacy" = true OR "entradas_inventario"."unidad_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "productos_donados" (
	"id_producto" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_usuario" uuid,
	"nombre_producto" text,
	"descripcion" text,
	"fecha_donacion" timestamp with time zone DEFAULT now(),
	"fecha_caducidad" timestamp with time zone,
	"alimento_id" bigint,
	"unidad_id" bigint
);
--> statement-breakpoint
CREATE TABLE "auditoria_donaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_donaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"donacion_id" integer NOT NULL,
	"accion" text NOT NULL,
	"estado_anterior" text,
	"estado_nuevo" text,
	"usuario_id" uuid NOT NULL,
	"rol_usuario" text NOT NULL,
	"motivo" text NOT NULL,
	"observaciones" text,
	"fecha_evento" timestamp with time zone DEFAULT now() NOT NULL,
	"metadatos" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "auditoria_donaciones_donacion_accion_key" UNIQUE("donacion_id","accion"),
	CONSTRAINT "auditoria_accion_valida" CHECK ("auditoria_donaciones"."accion" = 'cancelacion'),
	CONSTRAINT "auditoria_estado_anterior_valido" CHECK ("auditoria_donaciones"."estado_anterior" = 'Pendiente'),
	CONSTRAINT "auditoria_estado_nuevo_valido" CHECK ("auditoria_donaciones"."estado_nuevo" = 'Cancelada'),
	CONSTRAINT "auditoria_motivo_valido" CHECK ("auditoria_donaciones"."motivo" IN ('error_donante', 'no_disponible', 'calidad_inadecuada', 'logistica_imposible', 'duplicado', 'solicitud_donante', 'otro'))
);
--> statement-breakpoint
CREATE TABLE "donaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"nombre_donante" text NOT NULL,
	"ruc_donante" text,
	"cedula_donante" text,
	"direccion_donante_completa" text,
	"telefono" text NOT NULL,
	"email" text NOT NULL,
	"representante_donante" text,
	"tipo_persona_donante" text,
	"alimento_id" bigint,
	"tipo_producto" text NOT NULL,
	"categoria_comida" text NOT NULL,
	"es_producto_personalizado" boolean DEFAULT false NOT NULL,
	"cantidad" numeric(10, 2) NOT NULL,
	"unidad_id" bigint NOT NULL,
	"unidad_nombre" text NOT NULL,
	"unidad_simbolo" text NOT NULL,
	"fecha_vencimiento" date,
	"fecha_disponible" date NOT NULL,
	"direccion_entrega" text NOT NULL,
	"horario_preferido" text,
	"observaciones" text,
	"impacto_estimado_personas" integer,
	"impacto_equivalente" text,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"codigo_comprobante" text,
	"motivo_cancelacion" text,
	"observaciones_cancelacion" text,
	"usuario_cancelacion_id" uuid,
	"fecha_cancelacion" timestamp with time zone,
	"id_deposito" uuid,
	CONSTRAINT "donaciones_cantidad_positiva" CHECK ("donaciones"."cantidad" > 0),
	CONSTRAINT "donaciones_estado_valido" CHECK ("donaciones"."estado" IN ('Pendiente', 'Aprobada', 'Cancelada')),
	CONSTRAINT "donaciones_motivo_cancelacion_valido" CHECK ("donaciones"."motivo_cancelacion" IS NULL OR "donaciones"."motivo_cancelacion" IN ('error_donante', 'no_disponible', 'calidad_inadecuada', 'logistica_imposible', 'duplicado', 'solicitud_donante', 'otro')),
	CONSTRAINT "check_observaciones_cancelacion" CHECK ("donaciones"."motivo_cancelacion" <> 'otro' OR "donaciones"."observaciones_cancelacion" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "movimiento_inventario_cabecera" (
	"id_movimiento" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha_movimiento" timestamp,
	"id_donante" uuid NOT NULL,
	"id_solicitante" uuid NOT NULL,
	"estado_movimiento" text NOT NULL,
	"observaciones" text,
	CONSTRAINT "movimiento_cabecera_estado_valido" CHECK ("movimiento_inventario_cabecera"."estado_movimiento" IN ('pendiente', 'completado', 'donado'))
);
--> statement-breakpoint
CREATE TABLE "movimiento_inventario_detalle" (
	"id_detalle" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_movimiento" uuid NOT NULL,
	"id_producto" uuid NOT NULL,
	"cantidad" numeric NOT NULL,
	"tipo_transaccion" text NOT NULL,
	"rol_usuario" text NOT NULL,
	"observacion_detalle" text,
	"unidad_id" bigint,
	"cantidad_original" numeric,
	"unidad_convertida_id" bigint,
	"id_entrada" uuid,
	"id_deposito" uuid,
	CONSTRAINT "movimiento_detalle_tipo_valido" CHECK ("movimiento_inventario_detalle"."tipo_transaccion" IN ('ingreso', 'egreso', 'baja')),
	CONSTRAINT "movimiento_detalle_rol_valido" CHECK ("movimiento_inventario_detalle"."rol_usuario" IN ('donante', 'beneficiario', 'distribuidor')),
	CONSTRAINT "movimiento_detalle_cantidad_no_negativa" CHECK ("movimiento_inventario_detalle"."cantidad" > 0)
);
--> statement-breakpoint
CREATE TABLE "detalles_solicitud" (
	"id_detalle" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_solicitud" uuid,
	"id_producto" uuid,
	"cantidad_solicitada" numeric,
	"cantidad_entregada" numeric,
	"fecha_respuesta" timestamp with time zone,
	"comentario_admin" text
);
--> statement-breakpoint
CREATE TABLE "historial_donaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"cantidad_entregada" numeric(10, 2) NOT NULL,
	"porcentaje_entregado" numeric NOT NULL,
	"cantidad_solicitada" numeric(10, 2) NOT NULL,
	"operador_id" uuid,
	"comentario" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historial_cantidad_entregada_positiva" CHECK ("historial_donaciones"."cantidad_entregada" > 0),
	CONSTRAINT "historial_porcentaje_rango" CHECK ("historial_donaciones"."porcentaje_entregado" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "solicitudes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo_alimento" text NOT NULL,
	"cantidad" numeric NOT NULL,
	"comentarios" text,
	"latitud" double precision,
	"longitud" double precision,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_respuesta" timestamp with time zone,
	"comentario_admin" text,
	"unidad_id" bigint NOT NULL,
	"motivo_rechazo" text,
	"operador_rechazo_id" uuid,
	"operador_aprobacion_id" uuid,
	"fecha_rechazo" timestamp with time zone,
	"fecha_aprobacion" timestamp with time zone,
	"codigo_comprobante" text,
	"cantidad_entregada" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tiene_entregas_parciales" boolean DEFAULT false,
	CONSTRAINT "solicitudes_estado_valido" CHECK ("solicitudes"."estado" IN ('pendiente', 'aprobada', 'rechazada', 'entregada'))
);
--> statement-breakpoint
CREATE TABLE "configuracion_notificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"categoria" varchar(100) NOT NULL,
	"email_activo" boolean DEFAULT true,
	"push_activo" boolean DEFAULT true,
	"sonido_activo" boolean DEFAULT true,
	"fecha_actualizacion" timestamp with time zone DEFAULT now(),
	CONSTRAINT "configuracion_notificaciones_usuario_categoria_key" UNIQUE("usuario_id","categoria")
);
--> statement-breakpoint
CREATE TABLE "notificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"mensaje" text NOT NULL,
	"tipo" varchar(50) DEFAULT 'info',
	"destinatario_id" uuid,
	"rol_destinatario" varchar(50),
	"categoria" varchar(100) NOT NULL,
	"url_accion" varchar(500),
	"metadatos" jsonb DEFAULT '{}'::jsonb,
	"fecha_creacion" timestamp with time zone DEFAULT now(),
	"expira_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notificaciones_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notificacion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"leida" boolean DEFAULT false,
	"oculta" boolean DEFAULT false,
	"fecha_lectura" timestamp with time zone,
	"fecha_ocultacion" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notificaciones_usuario_notificacion_usuario_key" UNIQUE("notificacion_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "solicitudes_alta_alimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitante_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text NOT NULL,
	"comentario_donante" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"comentario_admin" text,
	"alimento_creado_id" bigint,
	"revisado_por" uuid,
	"fecha_revision" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitudes_alta_estado_valido" CHECK ("solicitudes_alta_alimentos"."estado" IN ('pendiente', 'aprobada', 'rechazada')),
	CONSTRAINT "solicitudes_alta_nombre_no_vacio" CHECK (length(trim("solicitudes_alta_alimentos"."nombre")) > 0),
	CONSTRAINT "solicitudes_alta_categoria_no_vacia" CHECK (length(trim("solicitudes_alta_alimentos"."categoria")) > 0)
);
--> statement-breakpoint
CREATE TABLE "solicitudes_alta_alimentos_unidades" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "solicitudes_alta_alimentos_unidades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"solicitud_id" uuid NOT NULL,
	"unidad_id" bigint NOT NULL,
	"es_unidad_principal" boolean DEFAULT false,
	CONSTRAINT "solicitudes_alta_alimentos_unidades_solicitud_unidad_key" UNIQUE("solicitud_id","unidad_id")
);
--> statement-breakpoint
CREATE TABLE "solicitudes_bodega" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donante_id" uuid NOT NULL,
	"id_deposito" uuid,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"direccion" text NOT NULL,
	"telefono" text NOT NULL,
	"latitud" double precision,
	"longitud" double precision,
	"estado" text DEFAULT 'PENDIENTE' NOT NULL,
	"motivo_rechazo" text,
	"revisado_por" uuid,
	"revisado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitudes_bodega_tipo_valido" CHECK ("solicitudes_bodega"."tipo" IN ('ALTA', 'MODIFICACION')),
	CONSTRAINT "solicitudes_bodega_nombre_longitud" CHECK (length("solicitudes_bodega"."nombre") BETWEEN 2 AND 150),
	CONSTRAINT "solicitudes_bodega_direccion_longitud" CHECK (length("solicitudes_bodega"."direccion") BETWEEN 5 AND 250),
	CONSTRAINT "solicitudes_bodega_telefono_longitud" CHECK (length("solicitudes_bodega"."telefono") BETWEEN 7 AND 30),
	CONSTRAINT "solicitudes_bodega_estado_valido" CHECK ("solicitudes_bodega"."estado" IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA')),
	CONSTRAINT "solicitudes_bodega_tipo_deposito_check" CHECK (("solicitudes_bodega"."tipo" = 'ALTA' AND "solicitudes_bodega"."id_deposito" IS NULL) OR ("solicitudes_bodega"."tipo" = 'MODIFICACION' AND "solicitudes_bodega"."id_deposito" IS NOT NULL)),
	CONSTRAINT "solicitudes_bodega_rechazo_check" CHECK ("solicitudes_bodega"."estado" <> 'RECHAZADA' OR length("solicitudes_bodega"."motivo_rechazo") >= 5),
	CONSTRAINT "solicitudes_bodega_latitud_rango" CHECK ("solicitudes_bodega"."latitud" IS NULL OR "solicitudes_bodega"."latitud" BETWEEN -90 AND 90),
	CONSTRAINT "solicitudes_bodega_longitud_rango" CHECK ("solicitudes_bodega"."longitud" IS NULL OR "solicitudes_bodega"."longitud" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "api_document_lookup_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"endpoint" text NOT NULL,
	"document_hash" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_endpoint_valido" CHECK ("api_document_lookup_audit_log"."endpoint" IN ('consulta_cedula', 'consulta_ruc')),
	CONSTRAINT "audit_log_hash_formato" CHECK ("api_document_lookup_audit_log"."document_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "audit_log_status_valido" CHECK ("api_document_lookup_audit_log"."status" IN ('allowed', 'blocked_rate_limit'))
);
--> statement-breakpoint
CREATE TABLE "api_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_rate_limits_user_endpoint_window_key" UNIQUE("user_id","endpoint","window_start"),
	CONSTRAINT "api_rate_limits_endpoint_valido" CHECK ("api_rate_limits"."endpoint" IN ('consulta_cedula', 'consulta_ruc')),
	CONSTRAINT "api_rate_limits_count_no_negativo" CHECK ("api_rate_limits"."request_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alimentos_unidades" ADD CONSTRAINT "alimentos_unidades_alimento_id_alimentos_id_fk" FOREIGN KEY ("alimento_id") REFERENCES "public"."alimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alimentos_unidades" ADD CONSTRAINT "alimentos_unidades_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversiones" ADD CONSTRAINT "conversiones_unidad_origen_id_unidades_id_fk" FOREIGN KEY ("unidad_origen_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversiones" ADD CONSTRAINT "conversiones_unidad_destino_id_unidades_id_fk" FOREIGN KEY ("unidad_destino_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_tipo_magnitud_id_tipos_magnitud_id_fk" FOREIGN KEY ("tipo_magnitud_id") REFERENCES "public"."tipos_magnitud"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bajas_productos" ADD CONSTRAINT "bajas_productos_id_producto_productos_donados_id_producto_fk" FOREIGN KEY ("id_producto") REFERENCES "public"."productos_donados"("id_producto") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bajas_productos" ADD CONSTRAINT "bajas_productos_id_entrada_entradas_inventario_id_entrada_fk" FOREIGN KEY ("id_entrada") REFERENCES "public"."entradas_inventario"("id_entrada") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bajas_productos" ADD CONSTRAINT "bajas_productos_usuario_responsable_id_usuarios_id_fk" FOREIGN KEY ("usuario_responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bajas_productos" ADD CONSTRAINT "bajas_productos_id_deposito_depositos_id_deposito_fk" FOREIGN KEY ("id_deposito") REFERENCES "public"."depositos"("id_deposito") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donante_depositos" ADD CONSTRAINT "donante_depositos_donante_id_usuarios_id_fk" FOREIGN KEY ("donante_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donante_depositos" ADD CONSTRAINT "donante_depositos_id_deposito_depositos_id_deposito_fk" FOREIGN KEY ("id_deposito") REFERENCES "public"."depositos"("id_deposito") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_inventario" ADD CONSTRAINT "entradas_inventario_donacion_id_donaciones_id_fk" FOREIGN KEY ("donacion_id") REFERENCES "public"."donaciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_inventario" ADD CONSTRAINT "entradas_inventario_donante_id_usuarios_id_fk" FOREIGN KEY ("donante_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_inventario" ADD CONSTRAINT "entradas_inventario_id_deposito_depositos_id_deposito_fk" FOREIGN KEY ("id_deposito") REFERENCES "public"."depositos"("id_deposito") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_inventario" ADD CONSTRAINT "entradas_inventario_id_producto_productos_donados_id_producto_fk" FOREIGN KEY ("id_producto") REFERENCES "public"."productos_donados"("id_producto") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_inventario" ADD CONSTRAINT "entradas_inventario_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_donados" ADD CONSTRAINT "productos_donados_id_usuario_usuarios_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_donados" ADD CONSTRAINT "productos_donados_alimento_id_alimentos_id_fk" FOREIGN KEY ("alimento_id") REFERENCES "public"."alimentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_donados" ADD CONSTRAINT "productos_donados_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_donaciones" ADD CONSTRAINT "auditoria_donaciones_donacion_id_donaciones_id_fk" FOREIGN KEY ("donacion_id") REFERENCES "public"."donaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_donaciones" ADD CONSTRAINT "auditoria_donaciones_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donaciones" ADD CONSTRAINT "donaciones_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donaciones" ADD CONSTRAINT "donaciones_alimento_id_alimentos_id_fk" FOREIGN KEY ("alimento_id") REFERENCES "public"."alimentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donaciones" ADD CONSTRAINT "donaciones_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donaciones" ADD CONSTRAINT "donaciones_usuario_cancelacion_id_user_id_fk" FOREIGN KEY ("usuario_cancelacion_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donaciones" ADD CONSTRAINT "donaciones_id_deposito_depositos_id_deposito_fk" FOREIGN KEY ("id_deposito") REFERENCES "public"."depositos"("id_deposito") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_inventario_cabecera" ADD CONSTRAINT "movimiento_inventario_cabecera_id_donante_usuarios_id_fk" FOREIGN KEY ("id_donante") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_inventario_cabecera" ADD CONSTRAINT "movimiento_inventario_cabecera_id_solicitante_usuarios_id_fk" FOREIGN KEY ("id_solicitante") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_inventario_detalle" ADD CONSTRAINT "movimiento_inventario_detalle_id_movimiento_movimiento_inventario_cabecera_id_movimiento_fk" FOREIGN KEY ("id_movimiento") REFERENCES "public"."movimiento_inventario_cabecera"("id_movimiento") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_inventario_detalle" ADD CONSTRAINT "movimiento_inventario_detalle_id_producto_productos_donados_id_producto_fk" FOREIGN KEY ("id_producto") REFERENCES "public"."productos_donados"("id_producto") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_inventario_detalle" ADD CONSTRAINT "movimiento_inventario_detalle_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_inventario_detalle" ADD CONSTRAINT "movimiento_inventario_detalle_unidad_convertida_id_unidades_id_fk" FOREIGN KEY ("unidad_convertida_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_inventario_detalle" ADD CONSTRAINT "movimiento_inventario_detalle_id_entrada_entradas_inventario_id_entrada_fk" FOREIGN KEY ("id_entrada") REFERENCES "public"."entradas_inventario"("id_entrada") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_inventario_detalle" ADD CONSTRAINT "movimiento_inventario_detalle_id_deposito_depositos_id_deposito_fk" FOREIGN KEY ("id_deposito") REFERENCES "public"."depositos"("id_deposito") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalles_solicitud" ADD CONSTRAINT "detalles_solicitud_id_solicitud_solicitudes_id_fk" FOREIGN KEY ("id_solicitud") REFERENCES "public"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalles_solicitud" ADD CONSTRAINT "detalles_solicitud_id_producto_productos_donados_id_producto_fk" FOREIGN KEY ("id_producto") REFERENCES "public"."productos_donados"("id_producto") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_donaciones" ADD CONSTRAINT "historial_donaciones_solicitud_id_solicitudes_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_donaciones" ADD CONSTRAINT "historial_donaciones_operador_id_usuarios_id_fk" FOREIGN KEY ("operador_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracion_notificaciones" ADD CONSTRAINT "configuracion_notificaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_destinatario_id_usuarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones_usuario" ADD CONSTRAINT "notificaciones_usuario_notificacion_id_notificaciones_id_fk" FOREIGN KEY ("notificacion_id") REFERENCES "public"."notificaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones_usuario" ADD CONSTRAINT "notificaciones_usuario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_alta_alimentos" ADD CONSTRAINT "solicitudes_alta_alimentos_solicitante_id_usuarios_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_alta_alimentos" ADD CONSTRAINT "solicitudes_alta_alimentos_alimento_creado_id_alimentos_id_fk" FOREIGN KEY ("alimento_creado_id") REFERENCES "public"."alimentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_alta_alimentos" ADD CONSTRAINT "solicitudes_alta_alimentos_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_alta_alimentos_unidades" ADD CONSTRAINT "solicitudes_alta_alimentos_unidades_solicitud_id_solicitudes_alta_alimentos_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_alta_alimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_alta_alimentos_unidades" ADD CONSTRAINT "solicitudes_alta_alimentos_unidades_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_bodega" ADD CONSTRAINT "solicitudes_bodega_donante_id_usuarios_id_fk" FOREIGN KEY ("donante_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_bodega" ADD CONSTRAINT "solicitudes_bodega_id_deposito_depositos_id_deposito_fk" FOREIGN KEY ("id_deposito") REFERENCES "public"."depositos"("id_deposito") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_bodega" ADD CONSTRAINT "solicitudes_bodega_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_document_lookup_audit_log" ADD CONSTRAINT "api_document_lookup_audit_log_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_rate_limits" ADD CONSTRAINT "api_rate_limits_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_usuarios_estado" ON "usuarios" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "idx_usuarios_fecha_fin_bloqueo" ON "usuarios" USING btree ("fecha_fin_bloqueo") WHERE "usuarios"."fecha_fin_bloqueo" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_cedula_idx" ON "usuarios" USING btree ("cedula") WHERE "usuarios"."cedula" IS NOT NULL AND "usuarios"."cedula" <> '';--> statement-breakpoint
CREATE INDEX "idx_alimentos_categoria" ON "alimentos" USING btree ("categoria");--> statement-breakpoint
CREATE INDEX "idx_alimentos_nombre" ON "alimentos" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "idx_alimentos_unidades_alimento" ON "alimentos_unidades" USING btree ("alimento_id");--> statement-breakpoint
CREATE INDEX "idx_alimentos_unidades_unidad" ON "alimentos_unidades" USING btree ("unidad_id");--> statement-breakpoint
CREATE INDEX "idx_conversiones_origen" ON "conversiones" USING btree ("unidad_origen_id");--> statement-breakpoint
CREATE INDEX "idx_conversiones_destino" ON "conversiones" USING btree ("unidad_destino_id");--> statement-breakpoint
CREATE INDEX "idx_conversiones_bidireccional" ON "conversiones" USING btree ("unidad_origen_id","unidad_destino_id");--> statement-breakpoint
CREATE INDEX "idx_tipos_magnitud_nombre" ON "tipos_magnitud" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "idx_unidades_nombre" ON "unidades" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "idx_unidades_simbolo" ON "unidades" USING btree ("simbolo");--> statement-breakpoint
CREATE INDEX "idx_unidades_tipo_magnitud" ON "unidades" USING btree ("tipo_magnitud_id");--> statement-breakpoint
CREATE INDEX "idx_unidades_es_base" ON "unidades" USING btree ("es_base") WHERE "unidades"."es_base" = true;--> statement-breakpoint
CREATE INDEX "idx_bajas_productos_estado" ON "bajas_productos" USING btree ("estado_baja");--> statement-breakpoint
CREATE INDEX "idx_bajas_productos_fecha" ON "bajas_productos" USING btree ("fecha_baja");--> statement-breakpoint
CREATE INDEX "idx_bajas_productos_motivo" ON "bajas_productos" USING btree ("motivo_baja");--> statement-breakpoint
CREATE INDEX "idx_bajas_productos_producto" ON "bajas_productos" USING btree ("id_producto");--> statement-breakpoint
CREATE INDEX "idx_bajas_productos_usuario" ON "bajas_productos" USING btree ("usuario_responsable_id");--> statement-breakpoint
CREATE INDEX "idx_bajas_productos_deposito" ON "bajas_productos" USING btree ("id_deposito");--> statement-breakpoint
CREATE INDEX "idx_bajas_productos_id_entrada" ON "bajas_productos" USING btree ("id_entrada");--> statement-breakpoint
CREATE UNIQUE INDEX "donante_depositos_donante_deposito_key" ON "donante_depositos" USING btree ("donante_id","id_deposito");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_donante_deposito_principal_activo" ON "donante_depositos" USING btree ("donante_id") WHERE "donante_depositos"."es_principal" = true AND "donante_depositos"."activo" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "entradas_inventario_donacion_unica" ON "entradas_inventario" USING btree ("donacion_id") WHERE "entradas_inventario"."donacion_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entradas_inventario_stock_idx" ON "entradas_inventario" USING btree ("id_deposito","id_producto","cantidad_disponible");--> statement-breakpoint
CREATE INDEX "entradas_inventario_fefo_idx" ON "entradas_inventario" USING btree ("id_deposito","id_producto","fecha_vencimiento","fecha_ingreso") WHERE "entradas_inventario"."cantidad_disponible" > 0 AND "entradas_inventario"."estado" = 'disponible';--> statement-breakpoint
CREATE INDEX "idx_entradas_inventario_donante_id" ON "entradas_inventario" USING btree ("donante_id");--> statement-breakpoint
CREATE INDEX "idx_entradas_inventario_id_producto" ON "entradas_inventario" USING btree ("id_producto");--> statement-breakpoint
CREATE INDEX "idx_entradas_inventario_unidad_id" ON "entradas_inventario" USING btree ("unidad_id");--> statement-breakpoint
CREATE INDEX "idx_productos_id_usuario" ON "productos_donados" USING btree ("id_usuario");--> statement-breakpoint
CREATE INDEX "idx_productos_donados_alimento_id" ON "productos_donados" USING btree ("alimento_id");--> statement-breakpoint
CREATE INDEX "idx_productos_donados_unidad" ON "productos_donados" USING btree ("unidad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_productos_donante_nombre_unidad" ON "productos_donados" USING btree (COALESCE("id_usuario", '00000000-0000-0000-0000-000000000000'::uuid),lower(trim("nombre_producto")),"unidad_id");--> statement-breakpoint
CREATE INDEX "idx_auditoria_donaciones_donacion_fecha" ON "auditoria_donaciones" USING btree ("donacion_id","fecha_evento");--> statement-breakpoint
CREATE INDEX "idx_auditoria_donaciones_usuario_fecha" ON "auditoria_donaciones" USING btree ("usuario_id","fecha_evento");--> statement-breakpoint
CREATE INDEX "idx_donaciones_alimento_id" ON "donaciones" USING btree ("alimento_id");--> statement-breakpoint
CREATE INDEX "idx_donaciones_unidad_id" ON "donaciones" USING btree ("unidad_id");--> statement-breakpoint
CREATE INDEX "idx_donaciones_user_id" ON "donaciones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_donaciones_estado" ON "donaciones" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "idx_donaciones_fecha_disponible" ON "donaciones" USING btree ("fecha_disponible");--> statement-breakpoint
CREATE INDEX "idx_donaciones_codigo_comprobante" ON "donaciones" USING btree ("codigo_comprobante");--> statement-breakpoint
CREATE INDEX "idx_donaciones_usuario_cancelacion" ON "donaciones" USING btree ("usuario_cancelacion_id");--> statement-breakpoint
CREATE INDEX "idx_donaciones_id_deposito" ON "donaciones" USING btree ("id_deposito");--> statement-breakpoint
CREATE INDEX "idx_movimiento_donante" ON "movimiento_inventario_cabecera" USING btree ("id_donante");--> statement-breakpoint
CREATE INDEX "idx_movimiento_solicitante" ON "movimiento_inventario_cabecera" USING btree ("id_solicitante");--> statement-breakpoint
CREATE INDEX "idx_detalle_movimiento" ON "movimiento_inventario_detalle" USING btree ("id_movimiento");--> statement-breakpoint
CREATE INDEX "idx_detalle_producto" ON "movimiento_inventario_detalle" USING btree ("id_producto");--> statement-breakpoint
CREATE INDEX "idx_movimiento_detalle_unidad" ON "movimiento_inventario_detalle" USING btree ("unidad_id");--> statement-breakpoint
CREATE INDEX "idx_movimiento_detalle_id_entrada" ON "movimiento_inventario_detalle" USING btree ("id_entrada");--> statement-breakpoint
CREATE INDEX "idx_movimiento_detalle_id_deposito" ON "movimiento_inventario_detalle" USING btree ("id_deposito");--> statement-breakpoint
CREATE INDEX "idx_movimiento_detalle_unidad_convertida" ON "movimiento_inventario_detalle" USING btree ("unidad_convertida_id");--> statement-breakpoint
CREATE INDEX "idx_historial_donaciones_fecha" ON "historial_donaciones" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_historial_donaciones_operador" ON "historial_donaciones" USING btree ("operador_id");--> statement-breakpoint
CREATE INDEX "idx_historial_donaciones_solicitud" ON "historial_donaciones" USING btree ("solicitud_id");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_codigo_comprobante" ON "solicitudes" USING btree ("codigo_comprobante");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_fecha_aprobacion" ON "solicitudes" USING btree ("fecha_aprobacion");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_fecha_rechazo" ON "solicitudes" USING btree ("fecha_rechazo");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_id_usuario" ON "solicitudes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_motivo_rechazo" ON "solicitudes" USING btree ("motivo_rechazo");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_operador_aprobacion" ON "solicitudes" USING btree ("operador_aprobacion_id");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_operador_rechazo" ON "solicitudes" USING btree ("operador_rechazo_id");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_unidad_id" ON "solicitudes" USING btree ("unidad_id");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_estado_fecha_respuesta" ON "solicitudes" USING btree ("estado","fecha_respuesta");--> statement-breakpoint
CREATE INDEX "idx_notificaciones_categoria" ON "notificaciones" USING btree ("categoria");--> statement-breakpoint
CREATE INDEX "idx_notificaciones_destinatario" ON "notificaciones" USING btree ("destinatario_id");--> statement-breakpoint
CREATE INDEX "idx_notificaciones_fecha_creacion" ON "notificaciones" USING btree ("fecha_creacion");--> statement-breakpoint
CREATE INDEX "idx_notificaciones_rol" ON "notificaciones" USING btree ("rol_destinatario");--> statement-breakpoint
CREATE INDEX "idx_notificaciones_usuario_usuario_notificacion" ON "notificaciones_usuario" USING btree ("usuario_id","notificacion_id");--> statement-breakpoint
CREATE INDEX "idx_notificaciones_usuario_usuario_visible" ON "notificaciones_usuario" USING btree ("usuario_id","oculta");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_bodega_donante_estado" ON "solicitudes_bodega" USING btree ("donante_id","estado");--> statement-breakpoint
CREATE INDEX "idx_solicitudes_bodega_estado_created" ON "solicitudes_bodega" USING btree ("estado","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "solicitudes_bodega_alta_pendiente_unica" ON "solicitudes_bodega" USING btree ("donante_id","nombre") WHERE "solicitudes_bodega"."tipo" = 'ALTA' AND "solicitudes_bodega"."estado" = 'PENDIENTE';--> statement-breakpoint
CREATE UNIQUE INDEX "solicitudes_bodega_modificacion_pendiente_unica" ON "solicitudes_bodega" USING btree ("donante_id","id_deposito") WHERE "solicitudes_bodega"."tipo" = 'MODIFICACION' AND "solicitudes_bodega"."estado" = 'PENDIENTE';--> statement-breakpoint
CREATE INDEX "idx_api_document_lookup_audit_log_user_created" ON "api_document_lookup_audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_api_rate_limits_user_endpoint_window" ON "api_rate_limits" USING btree ("user_id","endpoint","window_start");