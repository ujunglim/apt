package io.github.ujunglim.apt.region;

import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.data.repository.Repository;

public interface SggRankingRepository extends Repository<SggRanking, String> {

    List<SggRanking> findAll(Sort sort);
}
