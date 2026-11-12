import { Segmented } from "../../components/segmented";
import { sectionHead } from "../../components/styles";
import { type Settings, theme } from "../../lib/schemas";

export const ThemeSection = ({
  value,
  onChange,
}: {
  value: Settings["theme"];
  onChange: (theme: Settings["theme"]) => void;
}) => (
  <>
    <h2 className={sectionHead}>Theme</h2>
    <Segmented
      label="Theme"
      options={theme.options}
      names={{ system: "System", light: "Light", dark: "Dark" }}
      value={value}
      onChange={onChange}
    />
  </>
);
