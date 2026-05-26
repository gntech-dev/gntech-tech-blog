import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().min(5),
    description: z.string().min(20),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.literal('Gerlin Nolasco'),
    tags: z.array(z.string()).min(1),
    category: z.string().min(2),
    draft: z.boolean().default(false),
    validated_by: z.literal('GPT-5.5'),
    risk_level: z.enum(['low', 'medium', 'high']),
    image: z.object({
      src: z.string().startsWith('/'),
      alt: z.string().min(20),
      caption: z.string().min(20).optional(),
    }).optional(),
  }),
});

export const collections = { blog };
