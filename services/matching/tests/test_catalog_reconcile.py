"""The reconciliation ladder, rung by rung (ADR-0026 D4-D6).

Every fixture here is a name a real source could hand us: the Pieris homonym
(a shrub genus in Plantae and a butterfly genus in Animalia), the tomato's
genus transfer from Lycopersicon to Solanum, and denominations spelled in
Cyrillic and in Latin. The ladder is pure over these; nothing touches a
database.
"""

from __future__ import annotations

import pytest

from app import catalog_reconcile as ladder
from app.catalog_reconcile import (
    LabelCluster,
    Node,
    NodeName,
    climb_label_ladder,
    climb_node_ladder,
    recalibrated_threshold,
    rung_denomination,
    transliteration_keys,
    with_parsed_names,
)
from app.gnparser import GnParserUnavailable, gnparser_path

try:
    gnparser_path()
    GNPARSER_INSTALLED = True
except GnParserUnavailable:  # pragma: no cover - CI and the image install it
    GNPARSER_INSTALLED = False

needs_gnparser = pytest.mark.skipif(
    not GNPARSER_INSTALLED, reason="gnparser is not installed"
)


def taxon(node_id: str, name: str, kingdom: str, rank: str = "species", **kwargs) -> Node:
    return Node(
        id=node_id,
        canonical_name=name,
        node_kind="taxon",
        kingdom=kingdom,
        rank=rank,
        species_id=None,
        **kwargs,
    )


def form(node_id: str, name: str, species_id: str | None = None, kind: str = "cultivar", **kwargs) -> Node:
    return Node(
        id=node_id,
        canonical_name=name,
        node_kind=kind,
        kingdom=kwargs.pop("kingdom", "Plantae"),
        rank=None,
        species_id=species_id,
        **kwargs,
    )


class TestRungOne:
    def test_a_shared_identifier_outranks_every_other_signal(self):
        subject = taxon(
            "a",
            "Solanum lycopersicum",
            "Plantae",
            identifiers=frozenset({("eppo", "LYPES")}),
        )
        candidate = taxon(
            "b",
            "Lycopersicon esculentum",
            "Plantae",
            identifiers=frozenset({("eppo", "LYPES"), ("gbif", "2930137")}),
        )

        outcome = climb_node_ladder(subject, [subject, candidate])

        assert outcome.proposal is not None
        assert outcome.proposal.target_id == "b"
        assert outcome.proposal.reasons == ("shared_identifier:eppo",)
        assert outcome.proposal.confidence == pytest.approx(0.99)

    def test_a_node_without_identifiers_falls_through(self):
        subject = taxon("a", "Solanum lycopersicum", "Plantae")
        candidate = taxon(
            "b", "Solanum nigrum", "Plantae", identifiers=frozenset({("eppo", "SOLNI")})
        )

        assert ladder.rung_shared_identifier(subject, [candidate]) is None


class TestRungTwoAndThree:
    @needs_gnparser
    def test_the_tomato_genus_transfer_is_not_an_exact_authorship_match(self):
        # Solanum lycopersicum L. and Lycopersicon esculentum Mill. are the same
        # plant under two accepted names; the authorship differs, so rung two
        # must not claim them and rung three must not either (canonical names
        # differ). Only a shared identifier or a curator links these.
        nodes = with_parsed_names(
            [
                taxon("solanum", "Solanum lycopersicum L.", "Plantae"),
                taxon("lycopersicon", "Lycopersicon esculentum Mill.", "Plantae"),
            ],
            [],
        )

        outcome = climb_node_ladder(nodes[0], nodes)

        assert outcome.proposal is None

    @needs_gnparser
    def test_the_same_name_and_authorship_matches_across_spellings_of_the_verbatim(self):
        nodes = with_parsed_names(
            [
                taxon("a", "Solanum lycopersicum L.", "Plantae"),
                taxon("b", "Solanum  lycopersicum L.", "Plantae"),
            ],
            [],
        )

        outcome = climb_node_ladder(nodes[0], nodes)

        assert outcome.proposal is not None
        assert outcome.proposal.reasons == ("exact_scientific_authorship",)
        assert outcome.proposal.target_id == "b"

    @needs_gnparser
    def test_pieris_never_crosses_a_kingdom_and_records_the_conflict(self):
        # Pieris D.Don is a shrub; Pieris Schrank is a butterfly. Same
        # canonical name, different kingdoms: recorded, never proposed.
        nodes = with_parsed_names(
            [
                taxon("shrub", "Pieris japonica", "Plantae"),
                taxon("butterfly", "Pieris japonica", "Animalia"),
            ],
            [],
        )

        outcome = climb_node_ladder(nodes[0], nodes)

        assert outcome.proposal is None
        assert outcome.conflicts == ("homonym_kingdom_conflict:butterfly",)

    def test_the_same_canonical_name_in_one_kingdom_and_rank_proposes(self):
        subject = taxon("a", "Pieris japonica", "Plantae")
        candidate = taxon("b", "Pieris japonica", "Plantae")

        outcome = climb_node_ladder(subject, [subject, candidate])

        assert outcome.proposal is not None
        assert outcome.proposal.reasons == ("canonical_same_kingdom_rank",)
        assert outcome.proposal.confidence == pytest.approx(0.93)

    def test_the_same_name_at_different_ranks_is_not_proposed(self):
        subject = taxon("a", "Pieris", "Plantae", rank="genus")
        candidate = taxon("b", "Pieris", "Plantae", rank="species")

        assert climb_node_ladder(subject, [subject, candidate]).proposal is None


class TestRungFour:
    def test_a_typo_inside_one_genus_is_proposed_with_its_score(self):
        subject = taxon("a", "Solanum lycopersicum", "Plantae")
        candidate = taxon("b", "Solanum lycopersicom", "Plantae")

        outcome = climb_node_ladder(subject, [subject, candidate])

        assert outcome.proposal is not None
        assert outcome.proposal.target_id == "b"
        assert outcome.proposal.rule_code == "fuzzy_same_genus"
        assert outcome.proposal.confidence >= 0.92

    def test_a_close_name_in_another_genus_is_never_proposed(self):
        # 0.90-ish across genera: the issue's third fixture.
        subject = taxon("a", "Solanum nigrum", "Plantae")
        candidate = taxon("b", "Solanum nigrun", "Plantae")
        other_genus = taxon("c", "Solarum nigrum", "Plantae")

        assert (
            climb_node_ladder(subject, [subject, other_genus]).proposal is None
        ), "a different genus must not match however close the string is"
        assert climb_node_ladder(subject, [subject, candidate]).proposal is not None

    def test_a_distant_name_inside_one_genus_is_not_proposed(self):
        subject = taxon("a", "Solanum lycopersicum", "Plantae")
        candidate = taxon("b", "Solanum tuberosum", "Plantae")

        assert climb_node_ladder(subject, [subject, candidate]).proposal is None


class TestRungFive:
    def test_denominations_equal_after_the_shared_normalizer(self):
        subject = form("a", "Де Барао", species_id="tomato")
        candidate = form(
            "b",
            "де  барао",
            species_id="tomato",
            names=(NodeName("Де Барао", "denomination", "uk"),),
        )

        outcome = climb_node_ladder(subject, [subject, candidate])

        assert outcome.proposal is not None
        assert outcome.proposal.reasons == ("denomination_equal",)
        assert outcome.proposal.confidence == pytest.approx(0.96)

    def test_a_cyrillic_denomination_reaches_its_latin_spelling(self):
        subject = form("a", "Бичаче серце", species_id="tomato")
        candidate = form("b", "Bychache sertse", species_id="tomato")

        outcome = climb_node_ladder(subject, [subject, candidate])

        assert outcome.proposal is not None
        assert outcome.proposal.reasons == ("denomination_transliteration",)
        assert outcome.proposal.confidence == pytest.approx(0.94)

    def test_an_ambiguous_denomination_proposes_nothing(self):
        subject = form("a", "Слава", species_id="tomato")
        first = form("b", "Слава", species_id="tomato")
        second = form("c", "слава", species_id="tomato")

        assert climb_node_ladder(subject, [subject, first, second]).proposal is None

    def test_a_form_of_another_species_is_not_a_candidate(self):
        subject = form("a", "Де Барао", species_id="tomato")
        candidate = form("b", "Де Барао", species_id="pepper")

        assert climb_node_ladder(subject, [subject, candidate]).proposal is None

    def test_transliteration_keys_cover_the_three_markets(self):
        keys = transliteration_keys("Бичаче серце")

        assert any("bychache" in key for key in keys)
        assert all(key == key.casefold() for key in keys)


class TestCoUsage:
    def test_co_usage_raises_a_proposal_without_ever_creating_one(self):
        gardeners = frozenset({"g1", "g2"})
        subject = form("a", "Де Барао", species_id="tomato", gardener_ids=gardeners)
        candidate = form("b", "Де Барао", species_id="tomato", gardener_ids=gardeners)

        outcome = climb_node_ladder(subject, [subject, candidate])

        assert outcome.proposal is not None
        assert outcome.proposal.reasons == ("denomination_equal", "co_usage:2")
        assert outcome.proposal.confidence == pytest.approx(0.98)

        # Co-usage alone proposes nothing: two unrelated names stay unmatched.
        lonely = form("c", "Зовсім інша", species_id="tomato", gardener_ids=gardeners)
        assert climb_node_ladder(lonely, [lonely, candidate]).proposal is None


class TestLabelClusters:
    def cluster(self, label: str, **kwargs) -> LabelCluster:
        return LabelCluster(
            label=label,
            label_normalized=label.casefold(),
            object_kind=kwargs.pop("object_kind", "plant"),
            species_id=kwargs.pop("species_id", None),
            objects=kwargs.pop("objects", 3),
            entries=kwargs.pop("entries", 4),
            search_misses=kwargs.pop("search_misses", 2),
            **kwargs,
        )

    def test_a_label_links_to_the_cultivar_it_names(self):
        cultivar = form("cultivar", "Бичаче серце", species_id="tomato")

        outcome = climb_label_ladder(self.cluster("Бичаче серце"), [cultivar])

        assert outcome.proposal is not None
        assert outcome.proposal.target_id == "cultivar"
        assert outcome.proposal.reasons == ("denomination_equal",)

    def test_an_animal_label_never_reaches_a_plant_cultivar(self):
        cultivar = form("cultivar", "Карпатська", species_id="tomato")
        breed = form("breed", "Карпатська", species_id="bee", kind="breed", kingdom="Animalia")

        plant = climb_label_ladder(self.cluster("Карпатська", object_kind="plant"), [cultivar, breed])
        animal = climb_label_ladder(self.cluster("Карпатська", object_kind="animal"), [cultivar, breed])

        assert plant.proposal is not None and plant.proposal.target_id == "cultivar"
        assert animal.proposal is not None and animal.proposal.target_id == "breed"

    def test_impact_score_weights_objects_then_entries_and_misses(self):
        assert self.cluster("Слава").impact_score == 3 * 3 + 4 + 2

    def test_a_label_matching_nothing_proposes_nothing(self):
        assert climb_label_ladder(self.cluster("Моя рідкісна ягода"), []).proposal is None


class TestThresholds:
    def test_a_revert_rate_above_five_percent_raises_the_threshold(self):
        assert recalibrated_threshold(0.95, decisions=100, reverts=6) == pytest.approx(0.97)

    def test_a_clean_run_of_fifty_lowers_it(self):
        assert recalibrated_threshold(0.95, decisions=50, reverts=0) == pytest.approx(0.94)

    def test_fewer_than_fifty_clean_decisions_change_nothing(self):
        assert recalibrated_threshold(0.95, decisions=49, reverts=0) == pytest.approx(0.95)

    def test_the_bounds_hold_in_both_directions(self):
        assert recalibrated_threshold(0.99, decisions=100, reverts=90) == pytest.approx(0.99)
        assert recalibrated_threshold(0.80, decisions=500, reverts=0) == pytest.approx(0.80)


class TestDenominationRungDirectly:
    def test_it_refuses_a_taxon_candidate(self):
        species = taxon("species", "Solanum lycopersicum", "Plantae")

        assert rung_denomination(["Solanum lycopersicum"], None, [species]) is None

    def test_an_empty_denomination_proposes_nothing(self):
        assert rung_denomination(["", "   "], None, [form("a", "Де Барао")]) is None
