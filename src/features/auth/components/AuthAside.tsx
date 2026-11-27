import { CheckIcon } from "@/components/common/icons.tsx";
import { AI_NAME } from "@/config/ai.ts";

export function AuthAside() {
  return (
    <section className="auth-aside" aria-label="About Fan Desk">
      <div className="brand">
        <span className="logo" aria-hidden="true" />
        Fan Desk
      </div>
      <h1>Every chat in one inbox. {AI_NAME} drafts, and you decide.</h1>
      <ul className="points">
        <li><CheckIcon /><span>Drafts first: nothing is sent until you approve it.</span></li>
        <li><CheckIcon /><span>Every draft is read and approved by a person before it is sent.</span></li>
        <li><CheckIcon /><span>Your OFMAPI key is stored encrypted and never shown again.</span></li>
      </ul>
    </section>
  );
}
