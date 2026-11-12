package io.github.ujunglim.apt.region;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

/**
 * 읽기 전용 리포지토리. JpaRepository 대신 Repository 를 상속해 save/delete 같은 쓰기 메서드를 아예 노출하지 않는다.
 */
public interface SggPriceMonthlyRepository extends Repository<SggPriceMonthly, SggPriceMonthly.Key> {

    boolean existsBySggCd(String sggCd);

    Page<SggPriceMonthly> findBySggCdAndDealMonthBetween(
            String sggCd, LocalDate from, LocalDate to, Pageable pageable);

    /** 최근 N개월 추이용: 최신순으로 N개를 가져온 뒤 서비스에서 오래된 순으로 뒤집는다. */
    List<SggPriceMonthly> findBySggCdOrderByDealMonthDesc(String sggCd, Pageable pageable);
}
