import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Unit } from "../../../shared/amount";
import { send } from "../../lib/api";
import { shrink } from "../../lib/photo";
import { draft } from "../../lib/schemas";
import { useZodForm } from "../../lib/use-zod-form";
import { recording } from "./mic";
import { fields, review } from "./schema";

export function useDrafting(unit: Unit, onFail: () => void) {
  const form = useZodForm(review(unit));
  const [captureError, setCaptureError] = useState<Error | null>(null);
  const [image, setImage] = useState<string>();
  const drafting = useMutation({
    mutationFn: async (input: string | { audio: Blob } | { photo: Blob }) => {
      if (typeof input === "string") return draft.parse(await send("POST", "/api/drafts", { text: input }));
      if ("audio" in input) return draft.parse(await send("POST", "/api/voice", recording(input.audio)));
      const body = new FormData();
      body.set("image", await shrink(input.photo), "receipt.jpg");
      return draft.parse(await send("POST", "/api/drafts/photo", body));
    },
    networkMode: "always",
    onSuccess: (d) => form.reset(fields(d, unit)),
    onError: (e, input) => (typeof input === "string" ? onFail() : (setCaptureError(e), drop())),
  });
  const drop = () => (image && URL.revokeObjectURL(image), setImage(undefined));
  const unreview = () => (drafting.reset(), drop());
  const photo = (file: Blob) => (
    unreview(), setCaptureError(null), setImage(URL.createObjectURL(file)), drafting.mutate({ photo: file })
  );
  return {
    form,
    drafting,
    image,
    captureError,
    setCaptureError,
    unreview,
    photo,
    reviewing: drafting.isPending || drafting.isSuccess,
  };
}

export type Drafting = ReturnType<typeof useDrafting>;
