import { type DefaultValues, type FieldValues, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

export const useZodForm = <In extends FieldValues, Out extends FieldValues>(
  schema: z.ZodType<Out, In>,
  defaultValues?: DefaultValues<In>,
) => useForm<In, unknown, Out>({ resolver: zodResolver(schema), defaultValues });
