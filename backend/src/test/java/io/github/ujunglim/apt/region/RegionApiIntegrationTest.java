package io.github.ujunglim.apt.region;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 로컬 apt-postgres(5433)의 실제 api 뷰를 조회한다. `./gradlew integrationTest` 로 실행 (docker-compose up 필요).
 * 엔티티 매핑(컬럼명·타입)이 뷰와 맞는지 확인하는 것이 목적이라, 값 자체보다 형태와 불변 조건을 검사한다.
 */
@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
class RegionApiIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Test
    void prices_readsView() throws Exception {
        mvc.perform(get("/regions/11215/prices").param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").isNumber())
                .andExpect(jsonPath("$.content[0].ym").isString())
                .andExpect(jsonPath("$.content[0].tradeCnt").isNumber());
    }

    @Test
    void trend_readsView() throws Exception {
        mvc.perform(get("/regions/11215/trend").param("months", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sggNm").value("광진구"))
                .andExpect(jsonPath("$.points.length()").value(3));
    }

    @Test
    void ranking_excludesCurrentMonth() throws Exception {
        mvc.perform(get("/regions/ranking"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].rank").value(1));
    }

    @Test
    void unknownRegion_returns404() throws Exception {
        mvc.perform(get("/regions/99999/prices"))
                .andExpect(status().isNotFound());
    }
}
