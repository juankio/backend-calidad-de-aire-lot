import { z } from 'zod';

// Validación para creación de sesiones / campañas de medición geo-referenciadas
export const CreateSessionSchema = z
  .object({
    name: z.string().min(3).max(120),
    description: z.string().max(500).optional().default(''),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radius_meters: z.number().positive().max(50000).default(50),
    start_time: z.number().int().positive(),
    end_time: z.number().int().positive().optional(),
    device_id: z.string().min(1).max(64).default('air-guardian-01'),
  })
  .refine((data) => !data.end_time || data.end_time >= data.start_time, {
    message: 'end_time debe ser posterior o igual a start_time',
    path: ['end_time'],
  });

export type CreateSessionDto = z.infer<typeof CreateSessionSchema>;

// Validación para actualización de sesiones
export const UpdateSessionSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radius_meters: z.number().positive().max(50000).optional(),
  end_time: z.number().int().positive().nullable().optional(),
});

export type UpdateSessionDto = z.infer<typeof UpdateSessionSchema>;
