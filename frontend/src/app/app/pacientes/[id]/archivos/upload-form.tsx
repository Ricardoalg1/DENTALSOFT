"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FILE_CATEGORIES } from "@/lib/types";

const MAX_MB = 15;
/** Las series DICOM (tomografías, sets de radiografías) llegan en ZIP y pesan más. */
const MAX_ZIP_MB = 90;

/** Sube el archivo a /bff/patients/{id}/files (route handler: admite archivos de más de 1 MB). */
export function UploadForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(undefined);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecciona un archivo");
      return;
    }
    const zip = /\.zip$/i.test(file.name) || file.type.includes("zip");
    const limit = zip ? MAX_ZIP_MB : MAX_MB;
    if (file.size > limit * 1024 * 1024) {
      setError(`El ${zip ? "ZIP" : "archivo"} supera ${limit} MB`);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/bff/patients/${patientId}/files`, { method: "POST", body: formData });
        if (!res.ok) {
          const problem = await res.json().catch(() => null);
          setError(problem?.detail ?? "No se pudo subir el archivo");
          return;
        }
        formRef.current?.reset();
        router.refresh();
      } catch {
        setError("No se pudo conectar con el servidor");
      }
    });
  }

  // onSubmit (y no <form action>): React 19 resetea el formulario tras cada acción, incluso si falla,
  // y el usuario perdería lo que escribió.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit(new FormData(e.currentTarget));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
      <FormError message={error} />
      <div className="grid gap-1.5">
        <Label htmlFor="file">Archivo (JPG, PNG, WEBP, PDF o DICOM hasta {MAX_MB} MB; ZIP con imágenes DICOM hasta {MAX_ZIP_MB} MB)</Label>
        <Input
          id="file"
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf,application/dicom,.dcm,.dicom,application/zip,.zip"
        />
        <p className="text-xs text-muted-foreground">
          Las imágenes DICOM se abren en el visor de Occlus. Para una tomografía o varias radiografías, sube la carpeta que exporta el
          equipo comprimida en ZIP: el visor las ordena y las recorres una tras otra. Si tu equipo exporta archivos sueltos sin extensión,
          renómbralos a .dcm.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeSelect name="category" label="Tipo" options={FILE_CATEGORIES} defaultValue="RADIOGRAPH" />
        <div className="grid gap-1.5">
          <Label htmlFor="title">Título (opcional)</Label>
          <Input id="title" name="title" maxLength={150} placeholder="Ej.: Panorámica inicial" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        <Upload /> {pending ? "Subiendo…" : "Subir archivo"}
      </Button>
    </form>
  );
}
