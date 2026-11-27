import { ErrorText } from "@/components/app";
import { api } from "../api";
import { text } from "../i18n";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { LogoCard } from "./logo-card";

/** The Unit's default logo for its QR - a Unit Manager's to set. */
const LogoPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, reload } = useLoaded(unitId, (id) => api.unitLogo(id));
  const t = text().logo;

  if (!data) {
    return error ? <ErrorText>{error}</ErrorText> : <p className='text-muted-foreground'>{text().common.loading}</p>;
  }
  return (
    <LogoCard
      hasLogo={data.own}
      loadPreview={() => api.unitLogoPreview(unitId)}
      onRemove={async () => {
        await api.removeUnitLogo(unitId);
        reload();
      }}
      onUpload={async (file) => {
        await api.uploadUnitLogo(unitId, file);
        reload();
      }}
      removeLabel={t.removeOwn}
      stamp={`${unitId}|${data.own}`}
      title={t.onUnitQr(unit?.unitName ?? "")}
    >
      <p>{data.own ? t.ownSet : t.ownUnset}</p>
      <p>{t.appliesTo}</p>
    </LogoCard>
  );
};

export { LogoPage };
