import { supabase } from "@/integrations/supabase/client";

/**
 * Redimensiona e converte a imagem escolhida pelo usuário para WebP leve
 * (máx. 800px) diretamente no navegador antes de salvar ou enviar.
 */
export async function compressProductImage(
  file: File,
  maxWidth = 800,
  quality = 0.78,
): Promise<File> {
  const bitmap = await createImageBitmap(file);

  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );

  if (!blob) throw new Error("Falha ao converter a imagem.");

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Erro ao ler a imagem."));
    reader.readAsDataURL(file);
  });
}

/**
 * Envia o arquivo comprimido para o bucket `product-images` no Supabase Storage
 * e retorna a URL pública.
 */
export async function uploadProductImage(file: File, productId: string): Promise<string> {
  const compressed = await compressProductImage(file);
  const path = `${productId}/${Date.now()}.webp`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, compressed, {
      contentType: "image/webp",
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}