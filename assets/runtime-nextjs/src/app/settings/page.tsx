import {
  deleteApplicationOptionAction,
  saveApplicationOptionAction,
  saveApplicationSettingsAction,
} from "@/app/settings/actions";
import { getApplicationSettings, listApplicationOptions } from "@/features/settings/store";
import { requireUserManagementAccess } from "@/lib/auth";
import { formatValue } from "@/lib/presentation";
import { runtimeSpec } from "@/lib/spec";

export const dynamic = "force-dynamic";

const RESERVED_OPTIONS = new Set(["general.locale", "general.timezone"]);

const errorMessages: Record<string, string> = {
  invalid_application_settings: "Revisá el idioma y la zona horaria.",
  invalid_option_name: "El namespace y la clave deben comenzar con una letra minúscula y usar solo letras, números, punto, guion o guion bajo.",
  invalid_option_type: "El tipo de valor solicitado no es válido.",
  invalid_option_value: "El valor no coincide con el tipo seleccionado o el JSON no es válido.",
  option_too_large: "El valor supera el límite de 64 KB.",
  reserved_option: "Esa opción está reservada y se modifica desde Ajustes generales.",
};

const successMessages: Record<string, string> = {
  application: "Los ajustes generales fueron actualizados.",
  option: "La opción fue guardada.",
  option_removed: "La opción fue eliminada.",
};

function optionValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireUserManagementAccess();
  const requested = await searchParams;
  const [applicationSettings, options] = await Promise.all([getApplicationSettings(), listApplicationOptions()]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Administración</p>
          <h1>Configuración</h1>
          <p className="subtitle">Ajustes generales y opciones estructuradas de la aplicación.</p>
        </div>
      </div>
      {requested.error && errorMessages[requested.error] && <div className="notice import-error">{errorMessages[requested.error]}</div>}
      {requested.saved && successMessages[requested.saved] && <div className="notice success">{successMessages[requested.saved]}</div>}

      <section className="settings-section">
        <div className="settings-section-header">
          <div><p className="eyebrow">Sistema</p><h2>Ajustes generales</h2></div>
          <p className="subtitle">Estas opciones tienen validación propia porque afectan la presentación global.</p>
        </div>
        <article className="form-card">
          <form action={saveApplicationSettingsAction}>
            <div className="form-grid">
              <label className="field"><span className="field-label">Idioma</span><input className="control" defaultValue={applicationSettings.locale} name="locale" required /></label>
              <label className="field"><span className="field-label">Zona horaria</span><input className="control" defaultValue={applicationSettings.timezone} name="timezone" required /></label>
            </div>
            <div className="form-actions"><button className="button" type="submit">Guardar ajustes</button></div>
          </form>
        </article>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <div><p className="eyebrow">Clave / valor JSON</p><h2>Opciones de la aplicación</h2></div>
          <p className="subtitle">Usá namespaces por módulo. Admite texto, números, booleanos, objetos y arrays; no guardes contraseñas ni tokens.</p>
        </div>
        <article className="form-card">
          <form action={saveApplicationOptionAction}>
            <div className="form-grid settings-option-grid">
              <label className="field"><span className="field-label">Namespace</span><input className="control" maxLength={64} name="namespace" pattern="[a-z][a-z0-9_.-]{0,63}" placeholder="sitio" required /></label>
              <label className="field"><span className="field-label">Clave</span><input className="control" maxLength={64} name="key" pattern="[a-z][a-z0-9_.-]{0,63}" placeholder="menu_principal" required /></label>
              <label className="field"><span className="field-label">Tipo</span><select className="control" defaultValue="text" name="value_type"><option value="text">Texto</option><option value="number">Número</option><option value="boolean">Booleano</option><option value="json">JSON / array</option></select></label>
            </div>
            <label className="field settings-option-value"><span className="field-label">Valor</span><textarea className="control" name="value" placeholder={'Ejemplo JSON: ["inicio", "novedades", "contacto"]'} rows={5} /><span className="field-help">Para booleanos usá true o false. En JSON podés guardar objetos, arrays o null.</span></label>
            <div className="form-actions"><button className="button" type="submit">Guardar opción</button></div>
          </form>
        </article>

        <div className="table-wrap">
          {options.length ? (
            <table className="settings-options-table">
              <thead><tr><th>Opción</th><th>Valor</th><th>Actualizada</th><th>Acciones</th></tr></thead>
              <tbody>
                {options.map((option) => {
                  const identity = `${option.namespace}.${option.key}`;
                  return (
                    <tr key={identity}>
                      <td><code>{identity}</code><div className="table-secondary">{Array.isArray(option.value) ? "array" : option.value === null ? "null" : typeof option.value}</div></td>
                      <td><pre className="settings-option-json">{optionValue(option.value)}</pre></td>
                      <td>{formatValue(option.updated_at, runtimeSpec.app.locale)}<div className="table-secondary">{option.updated_by_name ?? option.updated_by_email ?? "Sistema"}</div></td>
                      <td>
                        {RESERVED_OPTIONS.has(identity) ? <span className="table-secondary">Gestionada arriba</span> : (
                          <form action={deleteApplicationOptionAction}>
                            <input name="namespace" type="hidden" value={option.namespace} />
                            <input name="key" type="hidden" value={option.key} />
                            <button className="button secondary" type="submit">Eliminar</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="empty">Todavía no hay opciones guardadas.</div>}
        </div>
      </section>
    </>
  );
}
