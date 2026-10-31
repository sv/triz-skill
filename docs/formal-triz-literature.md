# Formal TRIZ developments in Russian and Chinese

Research checked 2026-10-31. There is relevant prior work, particularly the Chinese
TRIZ–Extenics (可拓学) literature and Russian OTSM/ontology work. “Formal” has several meanings
here: a structured vocabulary, mathematical models and transformation rules, an executable
algorithm, or a machine-checked correctness proof. These sources support different levels.

This is a targeted primary-source review, not an exhaustive survey. Native-language titles,
reading scope and stable bibliography identifiers are recorded below. An application example
or a symbolic description does not establish solver completeness, optimality, or physical truth.

The follow-up [symbolic-summary design](symbolic-summary-design.md) maps the strongest sources
to concrete recognizer, composition, search-quotient and dependency-reuse changes. Its compiler
and pruning arguments are proposed engine work, not guarantees established by these papers.

## Russian-language sources

### OTSM object–attribute–value models — R126

Н. Н. Хоменко, **«Некоторые базовые модели, используемые в ОТСМ-ТРИЗ»**
(Some basic models used in OTSM-TRIZ), 2001; archive page posted in 2014.
The author describes adapting object–attribute–value representation into
element–feature-name–feature-value (ЭПЗ/ENV), relating it to resources, functions and
system views. This is a domain-independent representation and problem-solving methodology.
It is not a verified component-composition algorithm.
[Author archive](https://otsm-triz.org/content/models_otsm-triz_ru).

**Read:** archived article text, especially the ENV discussion. **Potential reuse:** an import
vocabulary for typed entities, properties and values, with names kept separate from identity.
ENV is not itself an executable constitutive law.

### Logic/topology-based task and tool representation — R124

С. В. Ревякин, **«Стандартная форма описания задачи и методических инструментов ТРИЗ»**
(A standard form for describing TRIZ problems and methodological tools), 2013,
*Современные научные исследования и инновации*, №8.
It proposes translating descriptions into atomic statements and implication records within a
topological/logical knowledge model, with a common representation for tasks and tools.
[Original article](https://web.snauka.ru/issues/2013/08/25950).

**Read:** textual construction and ARIZ application sections; image-based formulas were not
independently audited. **Potential reuse:** explicit fact/rule separation and indexed retrieval
of candidate rules. A natural-language translation remains an evidence obligation. In particular,
encoding a negated predicate as another positive atom requires consistency/complement constraints;
it does not by itself turn arbitrary logic into a sound, complete Horn solver.

### TRIZ ontology — R125

А. Курьян, М. Рубин, Н. Щедрин, О. Экардт, Н. Рубина,
**«ТРИЗ Онтология. Текущее состояние и перспективы»**
(TRIZ Ontology: current state and prospects), Minsk, 21 August 2020.
The report distinguishes concepts, models, rules, groups and synonyms, and maps TRIZ tools.
It explicitly identifies confusion between a model and rules for using that model.
[Authors' report](https://wumm-project.github.io/Texts/Ontology-TDS2020.pdf).

**Read:** report text, especially pp. 6–8 and the function/flow-model discussion; diagrams were
not independently reconstructed. **Potential reuse:** catalogue taxonomy, aliases, source
provenance and separate schemas for models versus generators. The checked report does not
establish an OWL reasoner implementation, machine-checked semantics or a correct synthesis solver.

## Chinese-language sources

### Formal component/function models using Extenics — R127

张文林、成思源、杨雪荣, **《基于基元理论的改进功能分析方法研究》**
(Improved function analysis based on basic-element theory), 2019,
*广东工业大学学报* 36(1):10–15. DOI: `10.12052/gdutxb.180096`.
Components, actions and relations are represented using object/characteristic/value basic
elements, connected into a functional relation graph.
[Publisher full text](https://html.rhhz.net/GDGYDXXB/html/20190102.htm).

**Read:** definitions and method, §§1.1–1.4. **Potential reuse:** typed property records and explicit
relationships between component properties and functions. Preserve meaning in schema fields;
the paper's identifier-encoding convention should not become a semantic dependency in our engine.
The article supplies a modelling method, not proof of graph-composition correctness.

### Substance–field transformations and candidate evaluation — R128

陈美蓉、江帆、黄浩翔、黄海涛、黄玉琴, **《物场−可拓创新方法研究及应用》**
(Study and application of the substance–field extension method), 2022,
*广东工业大学学报* 39(2):19–25,90. DOI: `10.12052/gdutxb.210185`.
It gives basic-element encodings of substances, fields and their interactions, then expresses
general solutions as transformations and evaluates generated designs.
[Publisher full text](https://html.rhhz.net/GDGYDXXB/html/1648878253628-1800685755.htm).

**Read:** §§1–2, including the transformation equations and generation workflow.
**Potential reuse:** typed candidate-generating templates with explicit changed objects and
dependencies. The displayed transformation from an “insufficient” effect to an “effective” one
needs an independent physical model in an executable engine. A weighted preference score does
not certify engineering feasibility or globally optimal lifetime cost.

### Transforming relations between changing properties — R129

李文军、杨春燕、汤龙等, **《可拓学中相关关系的变换方法研究》**
(Transformation methods for correlation relations in Extenics), 2019,
*智能系统学报* 14(4):619–626. DOI: `10.11992/tis.201811027`.
It defines dynamic matter-elements, functional dependencies and transformations that establish,
remove, strengthen or weaken relations. Its quantitative discussion includes finite-difference
signs and derivative-based influence comparisons.
[Publisher full text](https://html.rhhz.net/tis/html/201811027.htm).

**Read:** definitions and relation-transformation methods, §§1–2.
**Potential reuse:** a vocabulary for parameter dependency graphs and candidate edits. A local
sign or influence comparison is insufficient for global monotonicity, causal identification,
or a safe bound over an entire parameter region. Those hypotheses need separate checks.

### Forty principles as explicit transformations — R130

周贤永、陈光, **《TRIZ40条发明原理的可拓变换表述形式研究》**
(Extenics transformation expressions of the 40 TRIZ inventive principles), 2011,
*科技进步与对策* 28(5):107–115, published 10 March 2011.
[Publisher record](https://www.kjjb.org/CN/Y2011/V28/I5/107).

**Read:** bibliographic record and keywords only; its dynamic abstract/full text did not render.
The title establishes directly relevant prior work on formal principle descriptions. The
author's later book also describes this programme. **Potential reuse:** investigate its mappings
before designing principle-to-template generators. The full mapping, preconditions, executable
coverage and correctness remain unverified here; no implementation or theorem is imported.

### Ideality through lattice order — R131

周贤永、黄庆、赵立力, **《基于格论和TRIZ技术进化理论的理想化水平表述方式》**
(Representing ideality using lattice theory and TRIZ technical evolution), 2010,
*科技进步与对策* (21):5–9. Its existence/authorship are listed on the
[author's university publication page](https://faculty.swjtu.edu.cn/zhouxianyong/zh_CN/lwcg/120220/list/index.htm).
周贤永's 2021 book **《技术创新理论与方法》**, Higher Education Press,
ISBN `978-7-04-055299-7`, describes lattice/Hasse-diagram ideality as an alternative to a
benefit/cost quotient mixing dimensions.
[Publisher description and contents](https://xuanshu.hep.com.cn/front/h5Mobile/bookDetails?bookId=5fb948d15710f1bcc39a1b1a).

**Read:** author bibliography and book description/contents, not the paper or book chapters.
**Potential reuse:** compare this prior art with our ordered property vectors and ideality
semantics. Exact order, joins/meets and treatment of incomparable designs need the original
text before claiming equivalence. A Pareto frontier alone does not make the feasible designs
a lattice.

### Integration review — R132

赵燕伟、何路、洪欢欢、黄祥, **《面向TRIZ-可拓学集成的创新方法研究》**, 2015,
*广东工业大学学报* 32(2):1–10. DOI: `10.3969/j.issn.1007-7162.2015.02.001`.
It surveys TRIZ/Extenics integration and identifies basic-element modelling and transformation
approaches, including earlier work on inventive principles.
[Publisher full text](https://html.rhhz.net/GDGYDXXB/html/1007-7162%282015%2902-0001-10.htm).

**Read:** integration discussion and reference trail. This is a useful research map, not an
independent correctness proof or evidence that every referenced method was implemented.

### Quantitative physical-effect dependencies — R133

葛标标、杨春燕, **《科学效应与可拓变换、传导效应的关系研究》**, 2021,
*广东工业大学学报* 38(6):91–97. DOI: `10.12052/gdutxb.210103`.
[Publisher full text](https://html.rhhz.net/GDGYDXXB/html/1636452043221-421788683.htm).
The paper expresses physical effects through property dependencies and changes, connecting
them to quantitative coefficients. **Read:** §§1–2.8, including thermal expansion, deformation,
piezoelectricity and history-dependent shape memory. Some equations define coefficients rather
than a complete predictive constitutive model. **Potential reuse:** explicit law/dependency
records feeding a checked expression language. Applicability, parameters, domain guards and
state assumptions still need independent validation; stateless affine behavior does not follow
from an effect name.

### Propagation through compound elements — R134

廖升平、杨春燕, **《异类多维复合元间的传导规则及其在可拓创新设计中的应用》**, 2024,
*广东工业大学学报* 41(4):122–128. DOI: `10.12052/gdutxb.230161`.
[Publisher full text](https://html.rhhz.net/GDGYDXXB/html/1717584627093-1727027999.htm).
**Read:** definitions and propagation rules, §§1–2, especially shared-element change and
unrelated-compound cases. **Potential reuse:** support footprints and selective invalidation
of summaries. “No dependency” must be checked against complete expressions, guards and shared
parameters before implying unchanged semantics. These rules do not prove our incremental
compiler or authorize dropping unrelated constraints from a whole-system decision.

## Reuse for this engine

The following are implementation recommendations inferred from the sources, not results
already established by them:

| Existing workstream | What to investigate/reuse | Additional obligation here |
|---|---|---|
| B1/B2, E1 | ENV/basic-element import structures | Typed units, explicit domains, correlations, reviewed translation and source versions |
| E2, C2 | Lattice/partial-order views of ideality | State actual property orders and aggregation; retain ties/incomparability; prove claimed lattice laws |
| Principle-driven generators | Explicit transformations on objects, properties and relations | Turn proposals into guarded typed rewrites; check the complete resulting design |
| C3, parameterized synthesis | Functional-dependency and relation-transformation vocabulary | Verify global monotonicity and bound hypotheses on the declared parameter region |
| Catalogue/evidence contracts | Model/rule distinction, aliases and ontology organization | Preserve identity, implementation coupling, applicability and provenance |
| S6 symbolic summaries | Domain-independent representations as possible frontends | Check complete primitive semantics and prove composition/recognition laws independently |
| S6/S4 dependency reuse | Quantitative effect dependencies and compound-element propagation (R133/R134) | Derive complete footprints, prove frame conditions and bind cached summaries to semantic versions |

These works are useful prior art for representations and candidate generation. The inspected
Russian/Chinese sources did not supply a reusable Lean/Coq/Isabelle proof artifact for our
component-synthesis or symbolic-summary compiler. This is a finding about this source set,
not a claim that no such project exists. We have not audited every implementation those authors
may have published elsewhere. Keep the finite solver and exhaustive differential checks while
developing checked symbolic summaries; mathematical notation alone cannot justify pruning.

## Search scope and remaining reading

Public searches used Russian terms such as `ТРИЗ формализация математическая модель`,
`ОТСМ ЭПЗ ENV`, `ТРИЗ онтология`, and Chinese terms such as `TRIZ 形式化`, `可拓学 物场`,
`发明原理 可拓变换`, `理想化 格论`, plus theorem-prover terms. Publisher and author-hosted
texts were preferred; search snippets and papers merely cited by another paper were not
treated as read primary results. Publication dates above come from the source records, not
crawler/upload timestamps.

The highest-value missing reading is the full 2010 ideality paper and 2011 principle-mapping
paper. Further work would trace their later citations and locate runnable artifacts. This review
does not establish novelty, conduct a patent search, reproduce the engineering examples, or
validate their empirical coefficients. No third-party tables, figures or physical datasets were
imported into the repository.
