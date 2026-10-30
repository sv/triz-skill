import Certificates.MeanCostFixture
import Certificates.LifecycleFixture
import Certificates.LifecycleHolding
import Certificates.ComponentNetwork
import Certificates.ComponentBehavior
import Certificates.GeneralIdentity
import Certificates.BearingHeat
import Certificates.SoftwareCache
import Certificates.BearingEscalation
import Certificates.SupportWeakness
import Certificates.BearingDamped
import Certificates.BearingTrim
import Certificates.BearingBlocked

/-! Per-instance certificates, including finite cycle-cost and lifecycle witnesses: two models (`triz_export` format `lean`), one escalation trace and two unreachable escalations, one of a state-only target and one of a port target whose runs block (`triz_dynamics`), one weakness ranking (`triz_weakness`), and one preserved trim (`triz_behavior`); see `scripts/certify.mjs`. -/
