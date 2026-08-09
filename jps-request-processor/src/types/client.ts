/** A website client of JPS Solutions, keyed to the Facebook user that messages the Page. */
export type Client = {
  id: string;
  business_name: string;
  /** Page-scoped Facebook user id of the person who messages us. */
  facebook_sender_id: string;
  /** The Page the client messages, when we run more than one. */
  facebook_page_id: string | null;
  website_url: string | null;
  /** Whatever JPS uses to find the project in Lovable (name, URL, id). */
  lovable_project_reference: string | null;
  /** Free-text description of the site: pages, layout rules, things to preserve. */
  site_context: string | null;
  /** Standing instructions from JPS that apply to every request for this client. */
  special_instructions: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type NewClient = {
  business_name: string;
  facebook_sender_id: string;
  facebook_page_id?: string | null;
  website_url?: string | null;
  lovable_project_reference?: string | null;
  site_context?: string | null;
  special_instructions?: string | null;
  active?: boolean;
};

export type ClientPatch = Partial<NewClient>;
