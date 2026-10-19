import { byRecent } from "../../../shared/amount";
import { Button } from "../../components/button";
import { CategoryOptions } from "../../components/category";
import { Input, Select } from "../../components/form";
import { panel } from "../../components/styles";
import { useCategories, useSettings } from "../../lib/api";
import { useMonth } from "./use-month";

export function Filters() {
  const { filter, setFilter, filtered, query } = useMonth();
  const settings = useSettings()!;
  const categories = useCategories();
  const filterInput = (key: keyof typeof filter, label: string, type = "text") => (
    <Input className="min-w-0 flex-1" type={type} aria-label={label} placeholder={label} value={filter[key] ?? ""} onChange={(e) => setFilter({ ...filter, [key]: e.target.value })} />
  );
  return (
    <div className={`rise mt-4 grid grid-cols-2 gap-2 p-3 ${panel}`}>
      <div className="col-span-2 flex">{filterInput("q", "Search")}</div>
      <label className="label min-w-0">
        From
        {filterInput("from", "From", "date")}
      </label>
      <label className="label min-w-0">
        To
        {filterInput("to", "To", "date")}
      </label>
      <Select className="col-span-2 min-w-0" aria-label="Category" value={filter.category ?? ""} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
        <option value="">All categories</option>
        <CategoryOptions categories={categories} />
      </Select>
      <Select className="min-w-0" aria-label="Currency" value={filter.currency ?? ""} onChange={(e) => setFilter({ ...filter, currency: e.target.value })}>
        <option value="">All currencies</option>
        {byRecent(settings.recentCurrencies).map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      {filterInput("tag", "Tag")}
      <div className="col-span-2 flex justify-between px-1 pt-1 text-[13px] font-medium">
        {filtered ? (
          <Button variant="link" onClick={() => setFilter({})}>
            Clear filters
          </Button>
        ) : (
          <span />
        )}
        <a className="hit text-accent" href={`/api/export?${query}`} download="expenses.csv">
          Export CSV
        </a>
      </div>
    </div>
  );
}
