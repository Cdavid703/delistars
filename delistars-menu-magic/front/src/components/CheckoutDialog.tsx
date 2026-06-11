import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCart, formatCOP } from "@/context/CartContext";
import { SECTORES, SEDES } from "@/data/menu";
import { generateWhatsAppMessage, generateWhatsAppUrl } from "@/utils/whatsapp";
import { apiService } from "@/services/api";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(2, "Nombre muy corto").max(80),
  phone: z.string().trim().min(7, "Teléfono inválido").max(20),
  mode: z.enum(["domicilio", "recoger"]),
  address: z.string().trim().max(150).optional(),
  sector: z.string().optional(),
});

export const CheckoutDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { items, total, clear, setOpen, sede } = useCart();
  const [mode, setMode] = useState<"domicilio" | "recoger">("domicilio");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [sector, setSector] = useState("");
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse({ name, phone, mode, address, sector });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    if (mode === "domicilio" && (!address.trim() || !sector)) {
      toast.error("Completa dirección y sector para el domicilio");
      return;
    }

    if (!sede) {
      toast.error("Debes seleccionar una sede");
      return;
    }

    try {
      setIsLoading(true);

      // Guardar venta en la BD
      await apiService.createVenta({
        id_sede: sede,
        items: items.map(item => ({
          product: item.product,
          quantity: item.quantity,
          addons: item.addons,
        })),
      });

      toast.success("✅ Pedido guardado en el sistema");

      // Obtener info de la sede y generar mensaje de WhatsApp
      const sedeInfo = SEDES.find((s) => s.id === sede);
      if (!sedeInfo) {
        toast.error("Sede no encontrada");
        return;
      }

      // Generar el mensaje
      const message = generateWhatsAppMessage({
        name,
        phone,
        mode,
        address: address || "",
        sector: sector || "",
        sedeName: sedeInfo.name,
        items,
        total,
      });

      // Generar URL de WhatsApp
      const whatsappUrl = generateWhatsAppUrl(sedeInfo.whatsappPhone, message);

      // Mostrar confirmación
      setDone(true);

      // Redirigir a WhatsApp después de 1.5s
      setTimeout(() => {
        clear();
        setDone(false);
        onClose();
        setOpen(false);
        setName("");
        setPhone("");
        setAddress("");
        setSector("");

        // Abrir WhatsApp
        window.open(whatsappUrl, "_blank");
      }, 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al confirmar el pedido");
    } finally {
      setIsLoading(false);
    }
  };

  const sedeName = SEDES.find((s) => s.id === sede)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !done && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {done ? (
          <div className="py-10 text-center space-y-4 animate-scale-in">
            <CheckCircle2 className="w-20 h-20 text-primary mx-auto animate-bounce-soft" />
            <h3 className="text-2xl font-display text-foreground">¡Pedido confirmado! 🎉</h3>
            <p className="text-muted-foreground">Redirigiendo a WhatsApp...</p>
            <p className="text-sm text-muted-foreground">Total: <span className="font-semibold text-primary">{formatCOP(total)}</span></p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Finalizar pedido</DialogTitle>
              <DialogDescription>Cuéntanos cómo entregarte tu pedido en {sedeName}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4 mt-2">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="name">Nombre completo</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
                </div>
                <div>
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={20} />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Tipo de entrega</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as "domicilio" | "recoger")} className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-smooth ${mode === "domicilio" ? "border-primary bg-secondary/60" : "border-border"}`}>
                    <RadioGroupItem value="domicilio" />
                    <span className="text-sm font-medium">🛵 Domicilio</span>
                  </label>
                  <label className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-smooth ${mode === "recoger" ? "border-primary bg-secondary/60" : "border-border"}`}>
                    <RadioGroupItem value="recoger" />
                    <span className="text-sm font-medium">🏪 Recoger en sede</span>
                  </label>
                </RadioGroup>
              </div>

              {mode === "domicilio" && (
                <div className="space-y-3 animate-fade-in">
                  <div>
                    <Label htmlFor="address">Dirección</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle 123 #45-67, apto 301" maxLength={150} />
                  </div>
                  <div>
                    <Label htmlFor="sector">Sector / Barrio</Label>
                    <Select value={sector} onValueChange={setSector}>
                      <SelectTrigger id="sector"><SelectValue placeholder="Selecciona un sector" /></SelectTrigger>
                      <SelectContent>
                        {SECTORES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="bg-gradient-soft rounded-2xl p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Productos</span><span>{items.length}</span></div>
                <div className="flex justify-between font-display text-lg"><span>Total</span><span className="text-primary">{formatCOP(total)}</span></div>
              </div>

              <Button type="submit" size="lg" disabled={isLoading} className="w-full bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth disabled:opacity-50">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando pedido...
                  </>
                ) : (
                  'Confirmar pedido'
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
