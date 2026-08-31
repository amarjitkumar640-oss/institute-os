import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecruitmentsTab } from "./RecruitmentsTab";
import { CurrentAffairsTab } from "./CurrentAffairsTab";
import { CurrentAffairCategoriesTab } from "./CurrentAffairCategoriesTab";
import { SourcesTab } from "./SourcesTab";
import { SearchPromptsTab } from "./SearchPromptsTab";
import { AiAssistantTab } from "./AiAssistantTab";

type GovExamsTab = "recruitments" | "current-affairs" | "categories" | "sources" | "search-prompts" | "assistant";

export function GovExamsPage() {
  const [tab, setTab] = useState<GovExamsTab>("recruitments");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Government Exam Intelligence</h1>
          <p className="text-sm text-gray-400 mt-0.5">Job vacancies, exam calendar, and current affairs shown on thesuccess.in</p>
        </div>
      </div>

      <div className="flex-1 p-7 space-y-5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as GovExamsTab)}>
          <TabsList>
            <TabsTrigger value="recruitments">Recruitments</TabsTrigger>
            <TabsTrigger value="current-affairs">Current Affairs</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="search-prompts">Search Prompts</TabsTrigger>
            <TabsTrigger value="assistant">AI Assistant</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "recruitments" && <RecruitmentsTab />}
        {tab === "current-affairs" && <CurrentAffairsTab />}
        {tab === "categories" && <CurrentAffairCategoriesTab />}
        {tab === "sources" && <SourcesTab />}
        {tab === "search-prompts" && <SearchPromptsTab />}
        {tab === "assistant" && <AiAssistantTab />}
      </div>
    </div>
  );
}
