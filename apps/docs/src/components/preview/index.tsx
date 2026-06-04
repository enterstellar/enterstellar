import { Home } from 'lucide-react';
import { Heading } from 'fumadocs-ui/components/heading';
import { Card } from 'fumadocs-ui/components/card';
import { Callout } from 'fumadocs-ui/components/callout';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { type ReactNode } from 'react';
import { Wrapper } from './wrapper';
import { GithubInfo } from 'fumadocs-ui/components/github-info';

import {
  Banner,
  DynamicCodeBlock,
  File,
  Files,
  Folder,
  ImageZoom,
  InlineTOC,
} from '@/components/preview/lazy';
import BannerImage from '@/public/banner.avif';
import { gitConfig } from '@/lib/shared';

export function heading(): ReactNode {
  return (
    <Wrapper>
      <div className="rounded-lg bg-fd-background p-4 prose-no-margin">
        <Heading id="compilation-pipeline" as="h3">
          Compiler Validation Pipeline
        </Heading>
        <Heading id="agent-orchestration" as="h4">
          Deterministic Agent Orchestration & Safety Guardrails
        </Heading>
      </div>
    </Wrapper>
  );
}

export function card(): ReactNode {
  return (
    <Wrapper>
      <div className="rounded-lg bg-fd-background">
        <Card
          href="/concepts/component-contracts"
          icon={<Home />}
          title="Component Contracts"
          description="Learn how to declare a component intent, design tokens, and lifecycle state hooks."
        />
      </div>
    </Wrapper>
  );
}

export function tabs(): ReactNode {
  return (
    <Wrapper>
      <div className="prose-no-margin">
        <Tabs groupId="package-manager" persist items={['pnpm', 'npm', 'yarn']}>
          <Tab value="pnpm">
            <pre className="p-4 rounded-lg bg-fd-secondary text-fd-secondary-foreground font-mono text-sm">
              pnpm add @enterstellar-ai/react @enterstellar-ai/compiler zod
            </pre>
          </Tab>
          <Tab value="npm">
            <pre className="p-4 rounded-lg bg-fd-secondary text-fd-secondary-foreground font-mono text-sm">
              npm install @enterstellar-ai/react @enterstellar-ai/compiler zod
            </pre>
          </Tab>
          <Tab value="yarn">
            <pre className="p-4 rounded-lg bg-fd-secondary text-fd-secondary-foreground font-mono text-sm">
              yarn add @enterstellar-ai/react @enterstellar-ai/compiler zod
            </pre>
          </Tab>
        </Tabs>

        <Tabs groupId="pipeline-stage" persist items={['Intent Schema', 'Compiled Outputs']}>
          <Tab value="Intent Schema">
            <pre className="p-4 rounded-lg bg-fd-secondary text-fd-secondary-foreground font-mono text-sm">
              {`{
  "component": "PatientVitals",
  "props": {
    "riskLevel": 3,
    "hasAura": "yes"
  }
}`}
            </pre>
          </Tab>
          <Tab value="Compiled Outputs">
            <pre className="p-4 rounded-lg bg-fd-secondary text-fd-secondary-foreground font-mono text-sm">
              {`{
  "component": "PatientVitals",
  "props": {
    "riskLevel": 3,
    "hasAura": true // Deterministically coerced (Tier 1)
  },
  "status": "corrected",
  "provenance": {
    "agent": "gpt-4o",
    "compilerVersion": "1.0.0"
  }
}`}
            </pre>
          </Tab>
        </Tabs>
      </div>
    </Wrapper>
  );
}

export function typeTable(): ReactNode {
  return (
    <Wrapper>
      <div className="rounded-xl bg-fd-background">
        <TypeTable
          type={{
            determinism: {
              description: 'Dial determining agent intent variability (0.0 = rigid contract execution, 1.0 = full generative flexibility)',
              type: 'number',
              default: '1.0',
            },
            autoAccessibility: {
              description: 'Whether the compiler automatically injects missing W3C ARIA properties',
              type: 'boolean',
              default: 'true',
            },
          }}
        />
      </div>
    </Wrapper>
  );
}

export function zoomImage(): ReactNode {
  return (
    <Wrapper>
      <ImageZoom
        alt="banner"
        src={BannerImage}
        className="!my-0 rounded-xl bg-fd-background"
        priority
      />
    </Wrapper>
  );
}

export function accordion(): ReactNode {
  return (
    <Wrapper>
      <Accordions type="single" collapsible>
        <Accordion id="registry-metaphor" title="What is the Deck Metaphor?">
          The LLM does not write or generate custom React components. Instead, it plays predefined cards from a deck (the Component Registry). This guarantees that the LLM cannot hallucinate untyped or unauthorized components.
        </Accordion>
        <Accordion id="self-correction" title="What is 3-Tier Self-Correction?">
          When prop schema validations fail, the Compiler cascades through three recovery Tiers: 1) Pure deterministic coercion, 2) Default contract example extraction, and 3) LLM-powered self-correction callbacks.
        </Accordion>
      </Accordions>
    </Wrapper>
  );
}

export function callout(): ReactNode {
  return (
    <Wrapper>
      <Callout type="warn" title="Strict Type Safety Enforcement">
        The Compiler enforces `strict: true` at runtime. Any prop validation failure that cannot be self-corrected will automatically render the contract's defined fallback skeleton component instead of throwing fatal runtime UI errors.
      </Callout>
    </Wrapper>
  );
}

export function files(): ReactNode {
  return (
    <Wrapper>
      <Files>
        <Folder name="src" defaultOpen>
          <Folder name="enterstellar" defaultOpen>
            <Folder name="components" defaultOpen>
              <Folder name="status-card" defaultOpen>
                <File name="StatusCard.contract.ts" />
                <File name="StatusCard.tsx" />
                <File name="StatusCard.test.ts" />
                <File name="StatusCard.fixture.json" />
              </Folder>
            </Folder>
            <File name="registry.ts" />
          </Folder>
        </Folder>
        <File name="package.json" />
        <File name="tsconfig.json" />
      </Files>
    </Wrapper>
  );
}

export function inlineTOC(): ReactNode {
  return (
    <Wrapper>
      <InlineTOC
        items={[
          { title: 'Overview', url: '#overview', depth: 2 },
          { title: 'Component Contracts', url: '#component-contracts', depth: 3 },
          { title: 'The 4 Lifecycle States', url: '#the-4-lifecycle-states', depth: 3 },
          { title: 'Accessibility Standard', url: '#accessibility-standard', depth: 3 },
          { title: 'Compilation Pipeline', url: '#compilation-pipeline', depth: 2 },
          { title: 'Self-Correction Tiers', url: '#self-correction-tiers', depth: 3 },
          { title: 'Verification Harness', url: '#verification-harness', depth: 3 },
        ]}
      />
    </Wrapper>
  );
}

export function steps(): ReactNode {
  return (
    <Wrapper>
      <div className="rounded-xl bg-fd-background p-3">
        <Steps>
          <Step>
            <h4>Scaffold the component</h4>
            <p>Run <code>enterstellar add component StatusCard</code> to create the contracts, rendering stubs, tests, and mock JSON fixtures.</p>
          </Step>
          <Step>
            <h4>Define the Component Contract</h4>
            <p>Declare the Zod props schema, required design tokens, accessibility roles, and default contract states in the contract file.</p>
          </Step>
          <Step>
            <h4>Register in the Registry</h4>
            <p>Add the StatusCard contract into the system <code>{"createRegistry({ components: [StatusCard] })"}</code> block.</p>
          </Step>
          <Step>
            <h4>Verify the Intent</h4>
            <p>Run unit and integration tests using <code>createTestHarness</code> to assert correctness and guarantee compilation and self-correction coverage.</p>
          </Step>
        </Steps>
      </div>
    </Wrapper>
  );
}

export function dynamicCodeBlock(): ReactNode {
  return (
    <Wrapper>
      <DynamicCodeBlock />
    </Wrapper>
  );
}

export function banner(): ReactNode {
  return (
    <Wrapper>
      <div className="flex flex-col gap-4">
        <Banner className="z-0" changeLayout={false}>
          CRITICAL: Production compiler warnings are logged automatically to the system trace interface.
        </Banner>

        <Banner id="test-rainbow" className="z-0" variant="rainbow" changeLayout={false}>
          Deterministic Core active: compiling agent intents at <strong>100% safety threshold</strong>.
        </Banner>
      </div>
    </Wrapper>
  );
}

export function githubInfo(): ReactNode {
  return (
    <Wrapper>
      <GithubInfo
        owner={gitConfig.user}
        repo={gitConfig.repo}
        {...(process.env['GITHUB_TOKEN'] ? { token: process.env['GITHUB_TOKEN'] } : {})}
        className="not-prose bg-fd-card"
      />
    </Wrapper>
  );
}
